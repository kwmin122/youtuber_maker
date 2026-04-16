import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projects,
  projectChannels,
  channels,
  trendSnapshots,
  trendGapAnalyses,
} from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import {
  buildBenchmarkTokenSet,
  computeGapSetDiff,
  computeChannelSetHash,
} from "@/lib/trends/setdiff";

const querySchema = z.object({
  projectId: z.string().uuid(),
});

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_WINDOW = 500;

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    projectId: searchParams.get("projectId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { projectId } = parsed.data;

  // Rule 2: ownership check
  const [proj] = await db
    .select({ id: projects.id, userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!proj) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  if (proj.userId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Benchmark channels
  const benchmarks = await db
    .select({
      channelId: channels.id,
      title: channels.title,
      description: channels.description,
    })
    .from(projectChannels)
    .innerJoin(channels, eq(channels.id, projectChannels.channelId))
    .where(eq(projectChannels.projectId, projectId));

  if (benchmarks.length === 0) {
    return NextResponse.json({
      keywords: [],
      hitCache: false,
      reason: "no_benchmark_channels",
    });
  }

  const channelSetHash = computeChannelSetHash(
    benchmarks.map((b) => b.channelId)
  );

  // Latest snapshot date
  const [latest] = await db
    .select({ recordedAt: trendSnapshots.recordedAt })
    .from(trendSnapshots)
    .where(eq(trendSnapshots.regionCode, "KR"))
    .orderBy(desc(trendSnapshots.recordedAt))
    .limit(1);
  if (!latest) {
    return NextResponse.json({
      keywords: [],
      hitCache: false,
      reason: "no_snapshots",
    });
  }
  const latestSnapshotDate = latest.recordedAt.toISOString().slice(0, 10);

  // Cache probe
  const [cached] = await db
    .select()
    .from(trendGapAnalyses)
    .where(
      and(
        eq(trendGapAnalyses.userId, session.user.id),
        eq(trendGapAnalyses.channelSetHash, channelSetHash),
        eq(trendGapAnalyses.latestSnapshotDate, latestSnapshotDate)
      )
    )
    .limit(1);

  const now = new Date();
  if (
    cached &&
    cached.setdiffCache &&
    cached.ttlExpiresAt &&
    cached.ttlExpiresAt.getTime() > now.getTime()
  ) {
    return NextResponse.json({
      keywords: cached.setdiffCache.keywords,
      hitCache: true,
    });
  }

  // Compute fresh — filter to latest day only to avoid cross-day contamination
  const snapshotRows = await db
    .select({
      keyword: trendSnapshots.keyword,
      categoryId: trendSnapshots.categoryId,
      rank: trendSnapshots.rank,
      source: trendSnapshots.source,
    })
    .from(trendSnapshots)
    .where(
      and(
        eq(trendSnapshots.regionCode, "KR"),
        sql`${trendSnapshots.recordedAt}::date = ${latestSnapshotDate}::date`
      )
    )
    .orderBy(desc(trendSnapshots.recordedAt))
    .limit(SNAPSHOT_WINDOW);

  const benchmarkTokens = buildBenchmarkTokenSet(benchmarks);
  const keywords = computeGapSetDiff(
    snapshotRows.map((s) => ({
      keyword: s.keyword,
      categoryId: s.categoryId,
      rank: s.rank,
      source: s.source as "youtube" | "google-trends",
    })),
    benchmarkTokens,
    10
  );

  // Upsert cache
  const ttlExpiresAt = new Date(now.getTime() + CACHE_TTL_MS);
  await db
    .insert(trendGapAnalyses)
    .values({
      userId: session.user.id,
      projectId,
      channelSetHash,
      latestSnapshotDate,
      setdiffCache: { keywords },
      rationaleCache: cached?.rationaleCache ?? null,
      computedAt: now,
      ttlExpiresAt,
    })
    .onConflictDoUpdate({
      target: [
        trendGapAnalyses.userId,
        trendGapAnalyses.channelSetHash,
        trendGapAnalyses.latestSnapshotDate,
      ],
      set: {
        setdiffCache: { keywords },
        computedAt: now,
        ttlExpiresAt,
      },
    });

  return NextResponse.json({ keywords, hitCache: false });
}
