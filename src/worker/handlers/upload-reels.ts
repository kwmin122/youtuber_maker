import type { Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { projects, uploads, jobs, jobEvents } from "@/lib/db/schema";
import { account } from "@/db/schema/auth/account";
import { uploadVideoToInstagram } from "@/lib/instagram/uploader";
import { downloadFromUrl, uploadMedia } from "@/lib/media/storage";
import { ensurePlatformFormat } from "@/lib/media/video-format";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

/**
 * Handle Instagram Reels upload job.
 *
 * Expected payload:
 * - projectId: string
 * - title: string
 * - description: string
 *
 * Note: Instagram Reels are always public — no privacy level parameter.
 */
export async function handleUploadReels(job: Job, db: DrizzleInstance) {
  const { jobId, userId, payload } = job.data;
  const { projectId, title, description } = payload as {
    projectId: string;
    title: string;
    description?: string;
  };

  if (!projectId || !title) {
    throw new Error("projectId and title are required in payload");
  }

  let uploadId: string | undefined;

  try {
    // Step 1: Update job status to active, insert started jobEvent
    await db
      .update(jobs)
      .set({
        status: "active",
        progress: 0,
        currentStep: "preparing",
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "started",
      data: { projectId },
    });

    // Step 2: Validate project exists and has an exported video
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

    // Step 3: Fetch Instagram account
    const [igAccount] = await db
      .select()
      .from(account)
      .where(
        and(eq(account.userId, userId), eq(account.providerId, "instagram"))
      )
      .limit(1);

    if (!igAccount?.accessToken) {
      throw new Error("Instagram account not connected.");
    }

    // account.accountId holds the Instagram user ID
    const igUserId = igAccount.accountId;
    const accessToken = igAccount.accessToken;

    // Step 4: Check token expiry warning (Instagram long-lived tokens last 60 days)
    // Instagram token refresh requires re-auth, so we only warn and proceed.
    if (igAccount.accessTokenExpiresAt) {
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      if (igAccount.accessTokenExpiresAt < sevenDaysFromNow) {
        console.warn(
          `[upload-reels] Instagram access token expires soon (${igAccount.accessTokenExpiresAt.toISOString()}). ` +
            "User should reconnect their Instagram account to avoid interruption."
        );
      }
    }

    // Step 5: Download video
    await db
      .update(jobs)
      .set({ progress: 5, currentStep: "downloading-video", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    const videoBuffer = await downloadFromUrl(project.exportedVideoUrl);

    // Step 6: Validate and convert format
    await db
      .update(jobs)
      .set({ progress: 10, currentStep: "validating-format", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    const { buffer: processedBuffer, wasConverted } = await ensurePlatformFormat(
      videoBuffer,
      "reels"
    );

    if (wasConverted) {
      console.log(
        `[upload-reels] Video converted to 9:16 / trimmed for Reels (projectId: ${projectId})`
      );
    }

    // Step 7: Determine public video URL for Instagram API
    // Instagram requires a publicly accessible URL, not a raw buffer upload.
    let publicVideoUrl: string;
    if (wasConverted) {
      // Re-upload converted buffer to Supabase Storage to get a new public URL
      const stored = await uploadMedia({
        userId,
        projectId,
        sceneId: "reels-converted",
        filename: "reels-output.mp4",
        buffer: processedBuffer,
        contentType: "video/mp4",
      });
      publicVideoUrl = stored.publicUrl;
    } else {
      publicVideoUrl = project.exportedVideoUrl;
    }

    // Step 8: Insert uploads row
    const [uploadRow] = await db
      .insert(uploads)
      .values({
        projectId,
        userId,
        platform: "reels",
        title,
        description: description ?? "",
        status: "uploading",
      })
      .returning();

    uploadId = uploadRow.id;

    // Step 9: Upload to Instagram
    await db
      .update(jobs)
      .set({ progress: 15, currentStep: "uploading", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    const caption = description
      ? `${title}\n\n${description}`.slice(0, 2200)
      : title.slice(0, 2200);

    const result = await uploadVideoToInstagram({
      accessToken,
      igUserId,
      videoUrl: publicVideoUrl,
      caption,
      onProgress: async (pct: number) => {
        const mapped = 15 + Math.round(pct * 0.75);
        await db
          .update(jobs)
          .set({ progress: mapped, updatedAt: new Date() })
          .where(eq(jobs.id, jobId));
      },
    });

    // Step 10: Update uploads row with result
    await db
      .update(uploads)
      .set({
        reelsVideoId: result.reelsVideoId,
        videoUrl: result.videoUrl,
        status: "completed",
        uploadedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(uploads.id, uploadRow.id));

    // Step 11: Finalize job
    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: 100,
        currentStep: "complete",
        result: {
          uploadId: uploadRow.id,
          reelsVideoId: result.reelsVideoId,
          videoUrl: result.videoUrl,
        },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: {
        reelsVideoId: result.reelsVideoId,
        videoUrl: result.videoUrl,
      },
    });

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    // Update any in-progress upload to failed
    if (uploadId) {
      await db
        .update(uploads)
        .set({ status: "failed", errorMessage, updatedAt: new Date() })
        .where(eq(uploads.id, uploadId));
    } else {
      await db
        .update(uploads)
        .set({ status: "failed", errorMessage, updatedAt: new Date() })
        .where(
          and(
            eq(uploads.projectId, projectId),
            eq(uploads.status, "uploading")
          )
        );
    }

    await db
      .update(jobs)
      .set({ status: "failed", errorMessage, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "failed",
      data: { error: errorMessage },
    });

    throw error;
  }
}
