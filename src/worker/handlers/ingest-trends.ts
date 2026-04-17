import type { Job } from "bullmq";
import { eq, sql } from "drizzle-orm";
import {
  trendIngestionRuns,
  trendSnapshots,
  projectChannels,
  projects,
  jobs,
} from "@/lib/db/schema";
import { getTrendingVideos } from "@/lib/youtube/client";
import { fetchDailyTrends } from "@/lib/trends/google-trends-client";
import { DEFAULT_KR_CATEGORIES } from "@/lib/trends/categories";
import { extractKeywordsFromTrendingItem } from "@/lib/trends/keyword-extraction";
import { getQueue } from "@/lib/queue";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
  execute: typeof import("@/lib/db").db.execute;
  selectDistinct: typeof import("@/lib/db").db.selectDistinct;
};

type IngestTrendsPayload = {
  ingestionRunId: string;
  regionCode: string;
};

const TOP_N_PER_CATEGORY = 20;

export async function handleIngestTrends(
  job: Job,
  db: DrizzleInstance
): Promise<void> {
  const payload = (job.data.payload ?? job.data) as IngestTrendsPayload;
  const { ingestionRunId, regionCode } = payload;
  if (!ingestionRunId || !regionCode) {
    throw new Error(
      `ingest-trends: payload missing ingestionRunId/regionCode: ${JSON.stringify(payload)}`
    );
  }

  // 1. Mark run as running (CAS-safe — rule 1)
  const startRows = await db
    .update(trendIngestionRuns)
    .set({ status: "running" })
    .where(eq(trendIngestionRuns.id, ingestionRunId))
    .returning({ id: trendIngestionRuns.id });
  if (startRows.length === 0) {
    throw new Error(`trend_ingestion_runs ${ingestionRunId} not found`);
  }

  let successCount = 0;
  let partialCount = 0;
  let failureCount = 0;
  const errorDetails: Record<string, unknown> = {};
  const rowsToInsert: Array<{
    categoryId: number;
    regionCode: string;
    keyword: string;
    rank: number;
    source: "youtube" | "google-trends";
    videoCount: number | null;
    rawPayload: Record<string, unknown> | null;
  }> = [];

  // 2. YouTube categories
  for (const cat of DEFAULT_KR_CATEGORIES) {
    try {
      const items = await getTrendingVideos({
        categoryId: cat.id,
        regionCode,
        maxResults: TOP_N_PER_CATEGORY,
      });
      if (items.length === 0) {
        partialCount++;
        errorDetails[`cat_${cat.id}`] = "empty";
        continue;
      }
      let rank = 1;
      for (const item of items) {
        const keywords = extractKeywordsFromTrendingItem(item);
        for (const kw of keywords) {
          rowsToInsert.push({
            categoryId: cat.id,
            regionCode,
            keyword: kw,
            rank,
            source: "youtube",
            videoCount: item.viewCount,
            rawPayload: {
              videoId: item.youtubeVideoId,
              title: item.title,
              channelTitle: item.channelTitle,
            },
          });
          rank++;
        }
      }
      successCount++;
    } catch (err) {
      failureCount++;
      errorDetails[`cat_${cat.id}`] = (err as Error).message;
      console.warn(
        `[ingest-trends] category ${cat.id} failed (non-fatal): ${(err as Error).message}`
      );
    }
  }

  // 3. Google Trends (rules 12 + 13 — feature-flag non-fatal)
  try {
    const gt = await fetchDailyTrends({ geo: regionCode });
    if (gt.length === 0) {
      partialCount++;
      errorDetails["google_trends"] = "empty_or_disabled";
    } else {
      let rank = 1;
      for (const k of gt) {
        rowsToInsert.push({
          categoryId: 0, // uncategorized bucket for google-trends
          regionCode,
          keyword: k.keyword,
          rank: rank++,
          source: "google-trends",
          videoCount: null,
          rawPayload: { score: k.score },
        });
      }
    }
  } catch (err) {
    // Defense-in-depth — fetchDailyTrends already catches, but wrap again.
    partialCount++;
    errorDetails["google_trends"] = (err as Error).message;
    console.warn(`[ingest-trends] google-trends failed (non-fatal): ${(err as Error).message}`);
  }

  // 4. Idempotent insert (rule 7)
  // Use bare .onConflictDoNothing() (no expression target) so Postgres uses
  // the trend_snapshots_day_cat_region_kw_src_idx unique index automatically.
  if (rowsToInsert.length > 0) {
    await db
      .insert(trendSnapshots)
      .values(rowsToInsert)
      .onConflictDoNothing();
  }

  // 5. 30-day retention cleanup (rule 15 — best-effort)
  try {
    await db.execute(
      sql`DELETE FROM trend_snapshots WHERE recorded_at < NOW() - INTERVAL '30 days'`
    );
  } catch (err) {
    console.warn(
      `[ingest-trends] 30-day cleanup failed (non-fatal): ${(err as Error).message}`
    );
  }

  // 6. Chain precompute-gap-rationales per active user (rule 18)
  try {
    const activeUsers = await db
      .selectDistinct({ userId: projects.userId })
      .from(projectChannels)
      .innerJoin(projects, eq(projects.id, projectChannels.projectId));

    for (const u of activeUsers) {
      // Create a real jobs row so the `jobs.userId NOT NULL` contract
      // is honored — this is the per-user chained precompute, NOT the
      // cron ingestion itself. Rule 14.
      const [createdJob] = await db
        .insert(jobs)
        .values({
          userId: u.userId,
          type: "precompute-gap-rationales",
          status: "pending",
          progress: 0,
          payload: { userId: u.userId },
        })
        .returning({ id: jobs.id });

      await getQueue().add("precompute-gap-rationales", {
        payload: { userId: u.userId },
        jobId: createdJob.id,
        userId: u.userId,
      });
    }
  } catch (err) {
    console.warn(
      `[ingest-trends] chaining precompute-gap-rationales failed (non-fatal): ${(err as Error).message}`
    );
    errorDetails["chain_precompute"] = (err as Error).message;
  }

  // 7. Finalize run status
  const finalStatus =
    failureCount > 0 && successCount === 0
      ? "failed"
      : partialCount > 0 || failureCount > 0
      ? "partial"
      : "success";

  await db
    .update(trendIngestionRuns)
    .set({
      endedAt: new Date(),
      status: finalStatus,
      categoryCount: DEFAULT_KR_CATEGORIES.length,
      successCount,
      partialCount,
      failureCount,
      errorDetails: Object.keys(errorDetails).length > 0 ? errorDetails : null,
    })
    .where(eq(trendIngestionRuns.id, ingestionRunId));
}
