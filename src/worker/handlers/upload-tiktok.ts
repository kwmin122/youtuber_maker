import type { Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { projects, uploads, jobs, jobEvents } from "@/lib/db/schema";
import { account } from "@/db/schema/auth/account";
import { uploadVideoToTikTok } from "@/lib/tiktok/uploader";
import { downloadFromUrl } from "@/lib/media/storage";
import { ensurePlatformFormat } from "@/lib/media/video-format";
import { refreshTikTokToken } from "@/lib/auth/tiktok-oauth";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

/**
 * Handle TikTok upload job.
 *
 * Expected payload:
 * - projectId: string
 * - title: string
 * - description: string
 * - privacyLevel: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY"
 */
export async function handleUploadTikTok(job: Job, db: DrizzleInstance) {
  const { jobId, userId, payload } = job.data;
  const {
    projectId,
    title,
    description,
    privacyLevel = "SELF_ONLY",
  } = payload as {
    projectId: string;
    title: string;
    description?: string;
    privacyLevel?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
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

    // Step 3: Fetch TikTok account
    const [tiktokAccount] = await db
      .select()
      .from(account)
      .where(
        and(eq(account.userId, userId), eq(account.providerId, "tiktok"))
      )
      .limit(1);

    if (!tiktokAccount?.accessToken) {
      throw new Error(
        "TikTok account not connected. Please connect in Settings → 연결된 계정."
      );
    }

    // Step 4: Check token expiry and refresh if needed
    let accessToken = tiktokAccount.accessToken;
    if (
      tiktokAccount.accessTokenExpiresAt &&
      tiktokAccount.accessTokenExpiresAt < new Date()
    ) {
      if (!tiktokAccount.refreshToken) {
        throw new Error(
          "TikTok access token expired and no refresh token available. Please reconnect your TikTok account."
        );
      }
      const refreshed = await refreshTikTokToken(tiktokAccount.refreshToken);
      accessToken = refreshed.accessToken;

      await db
        .update(account)
        .set({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          accessTokenExpiresAt: new Date(
            Date.now() + refreshed.expiresIn * 1000
          ),
          refreshTokenExpiresAt: new Date(
            Date.now() + refreshed.refreshExpiresIn * 1000
          ),
          updatedAt: new Date(),
        })
        .where(eq(account.id, tiktokAccount.id));
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
      "tiktok"
    );

    if (wasConverted) {
      console.log(
        `[upload-tiktok] Video converted to 9:16 / trimmed for TikTok (projectId: ${projectId})`
      );
    }

    // Step 7: Insert uploads row
    const [uploadRow] = await db
      .insert(uploads)
      .values({
        projectId,
        userId,
        platform: "tiktok",
        title,
        description: description ?? "",
        status: "uploading",
      })
      .returning();

    uploadId = uploadRow.id;

    // Step 8: Upload to TikTok
    await db
      .update(jobs)
      .set({ progress: 15, currentStep: "uploading", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    const result = await uploadVideoToTikTok({
      accessToken,
      videoBuffer: processedBuffer,
      title,
      description: description ?? "",
      privacyLevel,
      onProgress: async (pct: number) => {
        const mapped = 15 + Math.round(pct * 0.75);
        await db
          .update(jobs)
          .set({ progress: mapped, updatedAt: new Date() })
          .where(eq(jobs.id, jobId));
      },
    });

    // Step 9: Update uploads row with result
    await db
      .update(uploads)
      .set({
        tiktokVideoId: result.tiktokVideoId,
        videoUrl: result.videoUrl,
        status: "completed",
        uploadedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(uploads.id, uploadRow.id));

    // Step 10: Finalize job
    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: 100,
        currentStep: "complete",
        result: {
          uploadId: uploadRow.id,
          tiktokVideoId: result.tiktokVideoId,
          videoUrl: result.videoUrl,
        },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: {
        tiktokVideoId: result.tiktokVideoId,
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
