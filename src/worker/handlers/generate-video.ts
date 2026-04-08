import type { Job } from "bullmq";
import { eq, and, isNull } from "drizzle-orm";
import { jobs, jobEvents, scenes, mediaAssets, apiKeys } from "@/lib/db/schema";
import { createKlingClient } from "@/lib/media/kling-client";
import { uploadMedia, downloadFromUrl } from "@/lib/media/storage";
import { decrypt, getMasterKey } from "@/lib/crypto";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

type GenerateVideoPayload = {
  sceneId: string;
  projectId: string;
  /** If provided, use image-to-video mode */
  sourceImageUrl?: string;
  /** Custom prompt override */
  customPrompt?: string;
  /** Video clip duration (3 or 5 seconds) */
  duration?: 3 | 5;
};

/**
 * Generate an AI video clip for a scene using Kling 3.0 API.
 * Steps:
 * 1. Load scene to get videoPrompt
 * 2. Resolve Kling API key from user's BYOK keys
 * 3. Submit video generation task
 * 4. Poll until completion
 * 5. Download and upload to Supabase Storage
 * 6. Create media_asset row
 */
export async function handleGenerateVideo(
  job: Job,
  db: DrizzleInstance
) {
  const jobId = job.data.jobId as string;
  const userId = job.data.userId as string;
  const payload = job.data.payload as GenerateVideoPayload;
  const { sceneId, projectId, sourceImageUrl, customPrompt, duration } = payload;

  try {
    // Mark as active
    await db
      .update(jobs)
      .set({
        status: "active",
        currentStep: "loading-scene",
        progress: 0,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "started",
      data: { sceneId },
    });

    // 1. Load scene
    const [scene] = await db
      .select()
      .from(scenes)
      .where(eq(scenes.id, sceneId))
      .limit(1);

    if (!scene) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    await db
      .update(jobs)
      .set({ currentStep: "submitting-task", progress: 10, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    // 2. Resolve Kling API key
    const klingApiKey = await resolveKlingKey(db, userId);
    const klingClient = createKlingClient(klingApiKey);

    // 3. Submit video generation task
    const taskId = await klingClient.submitTask({
      prompt: customPrompt ?? scene.videoPrompt,
      imageUrl: sourceImageUrl,
      duration: duration ?? 5,
      aspectRatio: "9:16",
    });

    // Create media_asset row in "generating" status
    const [asset] = await db
      .insert(mediaAssets)
      .values({
        sceneId,
        type: "video",
        url: "",
        storagePath: "",
        provider: "kling",
        status: "generating",
        metadata: {
          klingTaskId: taskId,
          prompt: customPrompt ?? scene.videoPrompt,
          duration: duration ?? 5,
          mode: sourceImageUrl ? "image-to-video" : "text-to-video",
        },
      })
      .returning();

    await db
      .update(jobs)
      .set({ currentStep: "polling-kling", progress: 30, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    // 4. Poll until completion
    const result = await klingClient.waitForCompletion(taskId, 60, 10_000);

    if (result.status === "failed") {
      throw new Error(`Kling video generation failed: ${result.errorMessage ?? "unknown error"}`);
    }

    if (!result.videoUrl) {
      throw new Error("Kling returned completed status but no video URL");
    }

    await db
      .update(jobs)
      .set({ currentStep: "downloading-video", progress: 70, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    // 5. Download and upload to Supabase Storage
    const videoBuffer = await downloadFromUrl(result.videoUrl);
    const filename = `video-${Date.now()}.mp4`;
    const storageResult = await uploadMedia({
      userId,
      projectId,
      sceneId,
      filename,
      buffer: videoBuffer,
      contentType: "video/mp4",
    });

    await db
      .update(jobs)
      .set({ currentStep: "saving-asset", progress: 90, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    // 6. Update media_asset row with final URL
    await db
      .update(mediaAssets)
      .set({
        url: storageResult.publicUrl,
        storagePath: storageResult.storagePath,
        status: "completed",
        updatedAt: new Date(),
      })
      .where(eq(mediaAssets.id, asset.id));

    // Mark job completed
    await db
      .update(jobs)
      .set({
        status: "completed",
        currentStep: "done",
        progress: 100,
        result: {
          assetId: asset.id,
          url: storageResult.publicUrl,
          klingTaskId: taskId,
        },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: { assetId: asset.id, klingTaskId: taskId },
    });
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

/**
 * Resolve the user's Kling API key.
 * Returns undefined if no key registered (will trigger stub mode).
 */
async function resolveKlingKey(
  db: DrizzleInstance,
  userId: string
): Promise<string | undefined> {
  const [keyRow] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.userId, userId),
        eq(apiKeys.provider, "kling"),
        isNull(apiKeys.revokedAt)
      )
    )
    .limit(1);

  if (!keyRow) {
    // No Kling key -- will use stub mode
    return undefined;
  }

  const masterKey = getMasterKey();
  return decrypt(
    {
      keyVersion: keyRow.keyVersion,
      encryptedDek: keyRow.encryptedDek,
      dekIv: keyRow.dekIv,
      dekAuthTag: keyRow.dekAuthTag,
      ciphertext: keyRow.ciphertext,
      dataIv: keyRow.dataIv,
      dataAuthTag: keyRow.dataAuthTag,
    },
    masterKey
  );
}
