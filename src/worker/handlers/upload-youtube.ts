import type { Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { projects, uploads, thumbnails, jobs, jobEvents } from "@/lib/db/schema";
import { account } from "@/db/schema/auth/account";
import { uploadVideoToYouTube } from "@/lib/youtube/uploader";
import { downloadFromUrl } from "@/lib/media/storage";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

/**
 * Handle YouTube upload job.
 *
 * Expected payload:
 * - projectId: string
 * - title: string
 * - description: string
 * - tags: string[]
 * - privacyStatus: "private" | "unlisted" | "public"
 * - publishAt?: string (ISO 8601)
 * - thumbnailId?: string (selected thumbnail ID)
 */
export async function handleUploadYouTube(job: Job, db: DrizzleInstance) {
  const { jobId, userId, payload } = job.data;
  const {
    projectId,
    title,
    description,
    tags,
    privacyStatus,
    publishAt,
    thumbnailId,
  } = payload;

  if (!projectId || !title) {
    throw new Error("projectId and title are required in payload");
  }

  try {
    // Update job status to active
    await db
      .update(jobs)
      .set({ status: "active", progress: 0, currentStep: "preparing", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "started",
      data: { projectId },
    });

    // 1. Validate project exists and has an exported video
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1);

    if (!project) {
      throw new Error("Project not found or unauthorized");
    }

    if (!project.exportedVideoUrl) {
      throw new Error(
        "No exported video found. Please export the video before uploading."
      );
    }

    // 2. Get user's Google OAuth access token
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

    // 3. Download the exported video
    await db
      .update(jobs)
      .set({ progress: 5, currentStep: "downloading-video", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    const videoBuffer = await downloadFromUrl(project.exportedVideoUrl);

    // 4. Download thumbnail if specified
    let thumbnailBuffer: Buffer | undefined;
    if (thumbnailId) {
      const [thumb] = await db
        .select()
        .from(thumbnails)
        .where(
          and(
            eq(thumbnails.id, thumbnailId),
            eq(thumbnails.projectId, projectId)
          )
        )
        .limit(1);

      if (thumb) {
        try {
          thumbnailBuffer = await downloadFromUrl(thumb.url);
        } catch (err) {
          console.warn("Failed to download thumbnail:", err);
          // Continue without thumbnail
        }
      }
    }

    // 5. Create uploads row
    const [uploadRow] = await db
      .insert(uploads)
      .values({
        projectId,
        userId,
        platform: "youtube",
        title,
        description: description || "",
        tags: tags || [],
        privacyStatus: privacyStatus || "private",
        publishAt: publishAt ? new Date(publishAt) : null,
        status: "uploading",
      })
      .returning();

    // 6. Upload to YouTube
    await db
      .update(jobs)
      .set({ progress: 10, currentStep: "uploading", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    const result = await uploadVideoToYouTube({
      accessToken,
      videoBuffer,
      title,
      description: description || "",
      tags: tags || [],
      privacyStatus: privacyStatus || "private",
      publishAt,
      thumbnailBuffer,
      onProgress: async (percent: number) => {
        // Map upload progress to 10-80 range
        const mappedProgress = 10 + Math.round(percent * 0.7);
        await db
          .update(jobs)
          .set({ progress: mappedProgress, updatedAt: new Date() })
          .where(eq(jobs.id, jobId));
      },
    });

    // 7. Update uploads row with result
    const finalStatus = publishAt ? "scheduled" : "completed";
    await db
      .update(uploads)
      .set({
        youtubeVideoId: result.youtubeVideoId,
        videoUrl: result.videoUrl,
        status: finalStatus,
        uploadedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(uploads.id, uploadRow.id));

    // 8. Finalize job
    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: 100,
        currentStep: "complete",
        result: {
          uploadId: uploadRow.id,
          youtubeVideoId: result.youtubeVideoId,
          videoUrl: result.videoUrl,
          status: finalStatus,
        },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: { youtubeVideoId: result.youtubeVideoId, videoUrl: result.videoUrl },
    });

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    // Update any in-progress upload to failed
    await db
      .update(uploads)
      .set({
        status: "failed",
        errorMessage,
        updatedAt: new Date(),
      })
      .where(
        and(eq(uploads.projectId, projectId), eq(uploads.status, "uploading"))
      );

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
