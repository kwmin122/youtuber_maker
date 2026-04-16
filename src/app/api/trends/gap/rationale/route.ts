import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projects,
  projectChannels,
  channels,
  trendSnapshots,
  trendGapAnalyses,
} from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import { tryAcquireRefreshToken } from "@/lib/trends/rate-limit";
import { getUserAIClient } from "@/lib/ai/get-user-ai-client";
import {
  buildGapRationalePrompt,
  parseGapRationaleResponse,
} from "@/lib/ai/prompts";
import { computeChannelSetHash } from "@/lib/trends/setdiff";

const bodySchema = z.object({
  keyword: z.string().min(1).max(100),
  projectId: z.string().uuid(),
});

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { keyword, projectId } = parsed.data;

  // Rule 2: ownership
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

  // Benchmark set
  const benchmarks = await db
    .select({
      channelId: channels.id,
      title: channels.title,
    })
    .from(projectChannels)
    .innerJoin(channels, eq(channels.id, projectChannels.channelId))
    .where(eq(projectChannels.projectId, projectId));

  if (benchmarks.length === 0) {
    return NextResponse.json(
      { error: "no_benchmark_channels" },
      { status: 400 }
    );
  }

  const channelSetHash = computeChannelSetHash(
    benchmarks.map((b) => b.channelId)
  );

  // Latest snapshot date for this keyword
  const [latest] = await db
    .select({ recordedAt: trendSnapshots.recordedAt, categoryId: trendSnapshots.categoryId })
    .from(trendSnapshots)
    .where(
      and(
        eq(trendSnapshots.regionCode, "KR"),
        eq(trendSnapshots.keyword, keyword)
      )
    )
    .orderBy(desc(trendSnapshots.recordedAt))
    .limit(1);
  if (!latest) {
    return NextResponse.json({ error: "keyword_not_in_snapshots" }, { status: 404 });
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

  const existingRationale =
    cached?.rationaleCache && cached.rationaleCache[keyword];
  if (existingRationale) {
    return NextResponse.json({
      keyword,
      rationale: existingRationale.rationale,
      suggestedAngle: existingRationale.suggestedAngle,
      hitCache: true,
    });
  }

  // Rate-limit per user (rule 16 — one on-demand call per 60 s per user)
  const rl = tryAcquireRefreshToken(`rationale:${session.user.id}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429 }
    );
  }

  // On-demand Gemini call (rule 10)
  const { provider } = await getUserAIClient(session.user.id);
  const { systemInstruction, userPrompt } = buildGapRationalePrompt(
    benchmarks.map((b) => b.title),
    [{ keyword, categoryId: latest.categoryId }]
  );
  const aiResponse = await provider.generateText(userPrompt, {
    systemInstruction,
    jsonMode: true,
    temperature: 0.4,
    maxTokens: 1024,
  });
  const items = parseGapRationaleResponse(aiResponse);
  const hit = items.find((i) => i.keyword === keyword) ?? items[0];
  if (!hit) {
    return NextResponse.json(
      { error: "ai_response_empty" },
      { status: 502 }
    );
  }

  // Merge into rationale_cache
  const now = new Date();
  const mergedCache = {
    ...(cached?.rationaleCache ?? {}),
    [keyword]: {
      rationale: hit.rationale,
      suggestedAngle: hit.suggestedAngle,
      generatedAt: now.toISOString(),
    },
  };
  const ttlExpiresAt = new Date(now.getTime() + CACHE_TTL_MS);
  await db
    .insert(trendGapAnalyses)
    .values({
      userId: session.user.id,
      projectId,
      channelSetHash,
      latestSnapshotDate,
      setdiffCache: cached?.setdiffCache ?? null,
      rationaleCache: mergedCache,
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
        rationaleCache: mergedCache,
        computedAt: now,
        ttlExpiresAt,
      },
    });

  return NextResponse.json({
    keyword,
    rationale: hit.rationale,
    suggestedAngle: hit.suggestedAngle,
    hitCache: false,
  });
}
