import type { Job } from "bullmq";
import { eq, and, desc } from "drizzle-orm";
import {
  jobs,
  jobEvents,
  channels,
  videos,
  transcripts,
} from "@/lib/db/schema";
import { fetchTranscript } from "@/lib/youtube/transcript";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

type TranscriptCollectPayload = {
  channelId: string; // internal channel UUID
  topN?: number;     // number of top videos to collect (default 10, CORE-03: 5~10)
};

/**
 * Batch transcript collection handler.
 * Collects transcripts for top N videos (by view count) of a channel.
 * Uses youtube-transcript first, then Google STT fallback (D-09).
 */
export async function handleTranscriptCollect(
  job: Job,
  db: DrizzleInstance
) {
  const jobId = job.data.jobId as string;
  const userId = job.data.userId as string;
  const payload = job.data.payload as TranscriptCollectPayload;
  const { channelId, topN = 10 } = payload;

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
      data: { type: "transcript-collect", channelId },
    });

    // Verify channel belongs to user
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

    // Get top N videos by view count
    const topVideos = await db
      .select()
      .from(videos)
      .where(eq(videos.channelId, channelId))
      .orderBy(desc(videos.viewCount))
      .limit(Math.min(topN, 10)); // Cap at 10 (CORE-03)

    if (topVideos.length === 0) {
      throw new Error(
        "No videos found for this channel. Fetch videos first."
      );
    }

    await db
      .update(jobs)
      .set({
        currentStep: `collecting-transcripts`,
        progress: 5,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    let collected = 0;
    let failed = 0;
    const results: Array<{
      videoId: string;
      title: string;
      status: "collected" | "failed" | "skipped";
      language?: string;
    }> = [];

    for (let i = 0; i < topVideos.length; i++) {
      const video = topVideos[i];
      const progress = Math.round(
        5 + ((i + 1) / topVideos.length) * 90
      ); // 5% to 95%

      await db
        .update(jobs)
        .set({
          currentStep: `transcript-${i + 1}/${topVideos.length}: ${video.title.slice(0, 40)}`,
          progress,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      // Check if transcript already exists for this video
      const [existingTranscript] = await db
        .select({ id: transcripts.id })
        .from(transcripts)
        .where(eq(transcripts.videoId, video.id))
        .limit(1);

      if (existingTranscript) {
        results.push({
          videoId: video.youtubeVideoId,
          title: video.title,
          status: "skipped",
        });
        collected++;
        continue;
      }

      try {
        const result = await fetchTranscript(video.youtubeVideoId);

        if (result) {
          // Save transcript to DB
          await db.insert(transcripts).values({
            videoId: video.id,
            language: result.language,
            source: result.source,
            segments: result.segments,
            fullText: result.fullText,
            fetchedAt: new Date(),
          });

          results.push({
            videoId: video.youtubeVideoId,
            title: video.title,
            status: "collected",
            language: result.language,
          });
          collected++;
        } else {
          // No transcript available -- STT fallback placeholder
          // TODO: Implement Google STT fallback (D-09)
          results.push({
            videoId: video.youtubeVideoId,
            title: video.title,
            status: "failed",
          });
          failed++;
        }
      } catch {
        results.push({
          videoId: video.youtubeVideoId,
          title: video.title,
          status: "failed",
        });
        failed++;
      }

      await db.insert(jobEvents).values({
        jobId,
        event: "progress",
        data: {
          step: i + 1,
          total: topVideos.length,
          videoTitle: video.title,
          status: results[results.length - 1].status,
        },
      });

      // Small delay between requests to avoid rate limiting
      if (i < topVideos.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // Mark as completed
    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: 100,
        currentStep: "done",
        result: {
          collected,
          failed,
          total: topVideos.length,
          details: results,
        },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: { collected, failed, total: topVideos.length },
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
