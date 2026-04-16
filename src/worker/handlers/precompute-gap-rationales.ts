import type { Job } from "bullmq";
import { eq, desc, and, sql } from "drizzle-orm";
import { createHash } from "crypto";
import {
  jobs,
  jobEvents,
  trendGapAnalyses,
  trendSnapshots,
  projectChannels,
  projects,
  channels,
} from "@/lib/db/schema";
import { getUserAIClient } from "@/lib/ai/get-user-ai-client";
import {
  buildGapRationalePrompt,
  parseGapRationaleResponse,
} from "@/lib/ai/prompts";
import { buildBenchmarkTokenSet } from "@/lib/trends/setdiff";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
  execute: typeof import("@/lib/db").db.execute;
};

type PrecomputePayload = { userId: string };

const TOP_N_GAP = 10;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export async function handlePrecomputeGapRationales(
  job: Job,
  db: DrizzleInstance
): Promise<void> {
  const jobId = job.data.jobId as string;
  const payload = job.data.payload as PrecomputePayload;
  const userId = payload.userId;

  try {
    await db
      .update(jobs)
      .set({ status: "active", progress: 5, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    // 1. Gather user's benchmark channel titles + descriptions
    const rows = await db
      .select({
        channelId: channels.id,
        title: channels.title,
        description: channels.description,
      })
      .from(projectChannels)
      .innerJoin(projects, eq(projects.id, projectChannels.projectId))
      .innerJoin(channels, eq(channels.id, projectChannels.channelId))
      .where(eq(projects.userId, userId));

    if (rows.length === 0) {
      // Nothing to precompute; mark done.
      await db
        .update(jobs)
        .set({
          status: "completed",
          progress: 100,
          result: { skipped: "no_benchmark_channels" },
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));
      return;
    }

    const channelSetHash = createHash("sha256")
      .update(rows.map((r) => r.channelId).sort().join(","))
      .digest("hex");

    // 2. Build benchmark token set (uses KO_STOPWORDS from setdiff.ts — rule 17)
    const benchmarkTokens = buildBenchmarkTokenSet(rows);

    // 3. Determine latest snapshot date, then fetch that day's rows only
    const [latestMeta] = await db
      .select({ recordedAt: trendSnapshots.recordedAt })
      .from(trendSnapshots)
      .where(eq(trendSnapshots.regionCode, "KR"))
      .orderBy(desc(trendSnapshots.recordedAt))
      .limit(1);

    if (!latestMeta) {
      await db
        .update(jobs)
        .set({
          status: "completed",
          progress: 100,
          result: { skipped: "no_snapshots" },
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));
      return;
    }
    const latestSnapshotDate = latestMeta.recordedAt.toISOString().slice(0, 10);

    const snapshotRows = await db
      .select({
        keyword: trendSnapshots.keyword,
        categoryId: trendSnapshots.categoryId,
        rank: trendSnapshots.rank,
        source: trendSnapshots.source,
        recordedAt: trendSnapshots.recordedAt,
      })
      .from(trendSnapshots)
      .where(
        and(
          eq(trendSnapshots.regionCode, "KR"),
          sql`${trendSnapshots.recordedAt}::date = ${latestSnapshotDate}::date`
        )
      )
      .orderBy(trendSnapshots.rank)
      .limit(500);

    if (snapshotRows.length === 0) {
      await db
        .update(jobs)
        .set({
          status: "completed",
          progress: 100,
          result: { skipped: "no_snapshots" },
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));
      return;
    }

    // 4. Tier 1 set-diff
    const seen = new Set<string>();
    const gap: Array<{
      keyword: string;
      categoryId: number;
      rank: number;
      source: "youtube" | "google-trends";
    }> = [];
    for (const s of snapshotRows) {
      if (benchmarkTokens.has(s.keyword)) continue;
      if (seen.has(s.keyword)) continue;
      seen.add(s.keyword);
      gap.push({
        keyword: s.keyword,
        categoryId: s.categoryId,
        rank: s.rank,
        source: s.source as "youtube" | "google-trends",
      });
      if (gap.length >= TOP_N_GAP) break;
    }

    // 5. BYOK Gemini call (rule 10)
    let rationaleMap: Record<
      string,
      { rationale: string; suggestedAngle: string; generatedAt: string }
    > = {};

    if (gap.length > 0) {
      const { provider } = await getUserAIClient(userId);
      const { systemInstruction, userPrompt } = buildGapRationalePrompt(
        rows.map((r) => r.title),
        gap.map((g) => ({ keyword: g.keyword, categoryId: g.categoryId }))
      );
      const aiResponse = await provider.generateText(userPrompt, {
        systemInstruction,
        jsonMode: true,
        temperature: 0.4,
        maxTokens: 4096,
      });
      const items = parseGapRationaleResponse(aiResponse);
      const now = new Date().toISOString();
      for (const it of items) {
        rationaleMap[it.keyword] = {
          rationale: it.rationale,
          suggestedAngle: it.suggestedAngle,
          generatedAt: now,
        };
      }
    }

    // 6. Upsert the cache row
    const ttlExpiresAt = new Date(Date.now() + CACHE_TTL_MS);
    await db
      .insert(trendGapAnalyses)
      .values({
        userId,
        projectId: null,
        channelSetHash,
        latestSnapshotDate,
        setdiffCache: { keywords: gap },
        rationaleCache: rationaleMap,
        computedAt: new Date(),
        ttlExpiresAt,
      })
      .onConflictDoUpdate({
        target: [
          trendGapAnalyses.userId,
          trendGapAnalyses.channelSetHash,
          trendGapAnalyses.latestSnapshotDate,
        ],
        set: {
          setdiffCache: { keywords: gap },
          rationaleCache: rationaleMap,
          computedAt: new Date(),
          ttlExpiresAt,
        },
      });

    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: 100,
        result: { gapCount: gap.length, rationaleCount: Object.keys(rationaleMap).length },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: { gapCount: gap.length },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    await db
      .update(jobs)
      .set({ status: "failed", errorMessage, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
    await db.insert(jobEvents).values({
      jobId,
      event: "failed",
      data: { error: errorMessage },
    });
    throw err;
  }
}
