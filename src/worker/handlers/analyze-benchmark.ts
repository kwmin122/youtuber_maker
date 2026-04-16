import type { Job } from "bullmq";
import { eq, and, inArray, desc, asc } from "drizzle-orm";
import {
  jobs,
  jobEvents,
  channels,
  transcripts,
  videos,
  analyses,
  projectChannels,
  trendSnapshots,
} from "@/lib/db/schema";
import { getUserAIClient } from "@/lib/ai/get-user-ai-client";
import {
  buildBenchmarkAnalysisPrompt,
  parseBenchmarkAnalysisResponse,
} from "@/lib/ai/prompts";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

type AnalyzeBenchmarkPayload = {
  projectId: string;
  channelId: string;
};

/**
 * Analyze collected transcripts for a benchmarking channel.
 * Steps:
 * 1. Validate channel belongs to project and user
 * 2. Gather all transcripts for the channel's videos
 * 3. Call AI provider with benchmarking analysis prompt
 * 4. Parse structured response and save to analyses table
 */
export async function handleAnalyzeBenchmark(
  job: Job,
  db: DrizzleInstance
) {
  const jobId = job.data.jobId as string;
  const userId = job.data.userId as string;
  const payload = job.data.payload as AnalyzeBenchmarkPayload;
  const { projectId, channelId } = payload;

  try {
    // Mark as active
    await db
      .update(jobs)
      .set({
        status: "active",
        currentStep: "validating",
        progress: 0,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "started",
      data: { type: "analyze-benchmark", projectId, channelId },
    });

    // 1. Validate channel ownership
    const [channel] = await db
      .select()
      .from(channels)
      .where(
        and(
          eq(channels.id, channelId),
          eq(channels.userId, userId)
        )
      )
      .limit(1);

    if (!channel) {
      throw new Error(`Channel ${channelId} not found for user`);
    }

    // Verify channel is linked to project
    const [link] = await db
      .select()
      .from(projectChannels)
      .where(
        and(
          eq(projectChannels.projectId, projectId),
          eq(projectChannels.channelId, channelId)
        )
      )
      .limit(1);

    if (!link) {
      throw new Error(`Channel ${channelId} is not linked to project ${projectId}`);
    }

    await db
      .update(jobs)
      .set({
        currentStep: "gathering-transcripts",
        progress: 10,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    // 2. Gather transcripts for the channel's videos
    const channelVideos = await db
      .select({ id: videos.id, title: videos.title })
      .from(videos)
      .where(eq(videos.channelId, channelId));

    if (channelVideos.length === 0) {
      throw new Error("No videos found for this channel. Fetch videos first.");
    }

    const videoIds = channelVideos.map((v) => v.id);
    const videoTitleMap = new Map(channelVideos.map((v) => [v.id, v.title]));

    const transcriptRows = await db
      .select()
      .from(transcripts)
      .where(inArray(transcripts.videoId, videoIds));

    if (transcriptRows.length === 0) {
      throw new Error(
        "No transcripts collected for this channel. Run transcript collection first."
      );
    }

    await db.insert(jobEvents).values({
      jobId,
      event: "progress",
      data: {
        step: "transcripts-gathered",
        count: transcriptRows.length,
      },
    });

    await db
      .update(jobs)
      .set({
        currentStep: "calling-ai",
        progress: 25,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    // 3. Get user's AI provider
    const { provider } = await getUserAIClient(userId);

    // 4. Build prompt and call AI
    const transcriptsForPrompt = transcriptRows.map((t) => ({
      videoTitle: videoTitleMap.get(t.videoId) || "Unknown",
      fullText: t.fullText,
    }));

    const { systemInstruction, userPrompt } =
      buildBenchmarkAnalysisPrompt(channel.title, transcriptsForPrompt);

    await db
      .update(jobs)
      .set({
        currentStep: "ai-analyzing",
        progress: 40,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    const aiResponse = await provider.generateText(userPrompt, {
      systemInstruction,
      jsonMode: true,
      temperature: 0.5,
      maxTokens: 8192,
    });

    await db
      .update(jobs)
      .set({
        currentStep: "parsing-results",
        progress: 75,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    // 5. Parse response
    const analysisResult = parseBenchmarkAnalysisResponse(aiResponse);

    // Phase 9 trend enrichment — non-fatal if snapshots table is empty
    try {
      const recentSnapshots = await db
        .select({
          keyword: trendSnapshots.keyword,
          rank: trendSnapshots.rank,
          source: trendSnapshots.source,
        })
        .from(trendSnapshots)
        .where(eq(trendSnapshots.regionCode, "KR"))
        .orderBy(desc(trendSnapshots.recordedAt), asc(trendSnapshots.rank))
        .limit(200);

      if (recentSnapshots.length > 0) {
        const snapshotKeywordMap = new Map<string, { rank: number; source: string }>();
        for (const s of recentSnapshots) {
          const key = s.keyword.toLowerCase().trim();
          if (!snapshotKeywordMap.has(key)) {
            snapshotKeywordMap.set(key, { rank: s.rank, source: s.source });
          }
        }

        for (const topic of analysisResult.topicRecommendations) {
          const tokens = topic.title
            .toLowerCase()
            .split(/\s+/)
            .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
            .filter((t) => t.length >= 2);
          for (const token of tokens) {
            const match = snapshotKeywordMap.get(token);
            if (match) {
              const score = Math.min(
                1,
                Math.max(0, Math.round((1 - match.rank / 20) * 100) / 100)
              );
              topic.trendBadge = {
                source: match.source as "youtube" | "google-trends",
                score,
                keyword: token,
                categoryId: 0,
              };
              break; // first match wins
            }
          }
        }
      }
    } catch {
      // Non-fatal: trend table may not exist yet in early deploys
    }

    // 6. Save to DB
    await db
      .update(jobs)
      .set({
        currentStep: "saving-results",
        progress: 85,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    const [savedAnalysis] = await db
      .insert(analyses)
      .values({
        projectId,
        channelId,
        transcriptIds: transcriptRows.map((t) => t.id),
        toneAnalysis: analysisResult.toneAnalysis,
        hookingPatterns: analysisResult.hookingPatterns,
        structurePatterns: analysisResult.structurePatterns,
        topicRecommendations: analysisResult.topicRecommendations,
        aiProvider: provider.name,
      })
      .returning({ id: analyses.id });

    // Mark as completed
    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: 100,
        currentStep: "done",
        result: {
          analysisId: savedAnalysis.id,
          provider: provider.name,
          transcriptsUsed: transcriptRows.length,
          topicsRecommended: analysisResult.topicRecommendations.length,
        },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: {
        analysisId: savedAnalysis.id,
        topicsCount: analysisResult.topicRecommendations.length,
      },
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";

    await db
      .update(jobs)
      .set({
        status: "failed",
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "failed",
      data: { error: errorMessage },
    });

    throw err;
  }
}
