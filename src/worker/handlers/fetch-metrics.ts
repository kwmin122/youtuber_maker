import type { Job } from "bullmq";
import { eq, and, isNotNull } from "drizzle-orm";
import { uploads, uploadMetrics, jobs, jobEvents } from "@/lib/db/schema";
import { account } from "@/db/schema/auth/account";
import { fetchVideoMetrics } from "@/lib/youtube/analytics";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

/**
 * Handle metrics fetch job.
 *
 * Fetches YouTube Analytics data for uploaded videos and upserts
 * into the upload_metrics table.
 *
 * Expected payload:
 * - uploadId?: string (specific upload, or omit for all user uploads)
 */
export async function handleFetchMetrics(job: Job, db: DrizzleInstance) {
  const { jobId, userId, payload } = job.data;
  const { uploadId } = payload || {};

  try {
    // Update job status
    await db
      .update(jobs)
      .set({ status: "active", progress: 0, currentStep: "loading-uploads", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "started",
      data: { uploadId },
    });

    // 1. Get Google OAuth access token
    const [googleAccount] = await db
      .select()
      .from(account)
      .where(
        and(eq(account.userId, userId), eq(account.providerId, "google"))
      )
      .limit(1);

    if (!googleAccount?.accessToken) {
      throw new Error(
        "Google account not connected. Please reconnect in Settings."
      );
    }

    const accessToken = googleAccount.accessToken;

    // 2. Get uploads to fetch metrics for
    let uploadsToFetch;
    if (uploadId) {
      uploadsToFetch = await db
        .select()
        .from(uploads)
        .where(
          and(
            eq(uploads.id, uploadId),
            eq(uploads.userId, userId)
          )
        );
    } else {
      // Fetch all completed YouTube uploads for this user
      uploadsToFetch = await db
        .select()
        .from(uploads)
        .where(
          and(
            eq(uploads.userId, userId),
            eq(uploads.platform, "youtube"),
            eq(uploads.status, "completed"),
            isNotNull(uploads.youtubeVideoId)
          )
        );
    }

    if (uploadsToFetch.length === 0) {
      await db
        .update(jobs)
        .set({
          status: "completed",
          progress: 100,
          currentStep: "no-uploads",
          result: { message: "No uploads to fetch metrics for", count: 0 },
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      return { count: 0 };
    }

    // 3. Fetch metrics for each upload
    let processedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < uploadsToFetch.length; i++) {
      const upload = uploadsToFetch[i];
      const progress = Math.round(((i + 1) / uploadsToFetch.length) * 90);

      await db
        .update(jobs)
        .set({
          progress,
          currentStep: `fetching-metrics-${i + 1}/${uploadsToFetch.length}`,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      if (!upload.youtubeVideoId) continue;

      try {
        // Calculate date range
        const endDate = new Date();
        const startDate = upload.uploadedAt
          ? new Date(
              Math.max(
                upload.uploadedAt.getTime(),
                endDate.getTime() - 7 * 24 * 60 * 60 * 1000 // max 7 days back
              )
            )
          : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

        const formatDate = (d: Date) => d.toISOString().split("T")[0];

        const snapshots = await fetchVideoMetrics({
          accessToken,
          youtubeVideoId: upload.youtubeVideoId,
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
        });

        // Upsert each snapshot into upload_metrics
        for (const snapshot of snapshots) {
          const snapshotDate = new Date(snapshot.date);

          // Try to find existing record
          const [existing] = await db
            .select({ id: uploadMetrics.id })
            .from(uploadMetrics)
            .where(
              and(
                eq(uploadMetrics.uploadId, upload.id),
                eq(uploadMetrics.date, snapshotDate)
              )
            )
            .limit(1);

          if (existing) {
            // Update existing record
            await db
              .update(uploadMetrics)
              .set({
                viewCount: snapshot.viewCount,
                likeCount: snapshot.likeCount,
                commentCount: snapshot.commentCount,
                subscriberDelta: snapshot.subscriberDelta,
                watchTimeMinutes: snapshot.watchTimeMinutes,
                impressions: snapshot.impressions,
                ctr: snapshot.ctr,
              })
              .where(eq(uploadMetrics.id, existing.id));
          } else {
            // Insert new record
            await db.insert(uploadMetrics).values({
              uploadId: upload.id,
              date: snapshotDate,
              viewCount: snapshot.viewCount,
              likeCount: snapshot.likeCount,
              commentCount: snapshot.commentCount,
              subscriberDelta: snapshot.subscriberDelta,
              watchTimeMinutes: snapshot.watchTimeMinutes,
              impressions: snapshot.impressions,
              ctr: snapshot.ctr,
            });
          }
        }

        processedCount++;
      } catch (err) {
        console.warn(
          `Failed to fetch metrics for upload ${upload.id} (video: ${upload.youtubeVideoId}):`,
          err instanceof Error ? err.message : err
        );
        errorCount++;
        // Continue with next upload
      }
    }

    // 4. Finalize
    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: 100,
        currentStep: "complete",
        result: {
          processed: processedCount,
          errors: errorCount,
          total: uploadsToFetch.length,
        },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: { processed: processedCount, errors: errorCount },
    });

    return { processed: processedCount, errors: errorCount };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

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

    throw error;
  }
}
