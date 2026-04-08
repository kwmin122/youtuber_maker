import type { Job } from "bullmq";
import { eq, and, isNull } from "drizzle-orm";
import { jobs, jobEvents, scenes, mediaAssets, apiKeys } from "@/lib/db/schema";
import { generateImage } from "@/lib/media/image-generator";
import { uploadMedia, downloadFromUrl } from "@/lib/media/storage";
import { decrypt, getMasterKey } from "@/lib/crypto";
import type { ImageStyle } from "@/lib/media/types";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

type GenerateImagePayload = {
  sceneId: string;
  projectId: string;
  style?: ImageStyle;
  /** Custom prompt override (for regeneration with edited prompt) */
  customPrompt?: string;
};

/**
 * Generate an AI image for a scene using DALL-E 3.
 * Steps:
 * 1. Load scene to get imagePrompt
 * 2. Generate image via OpenAI DALL-E 3
 * 3. Download the generated image
 * 4. Upload to Supabase Storage
 * 5. Create/update media_asset row
 */
export async function handleGenerateImage(
  job: Job,
  db: DrizzleInstance
) {
  const jobId = job.data.jobId as string;
  const userId = job.data.userId as string;
  const payload = job.data.payload as GenerateImagePayload;
  const { sceneId, projectId, style, customPrompt } = payload;

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
      .set({ currentStep: "generating-image", progress: 20, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    // 2. Resolve OpenAI API key from user's BYOK keys
    const openaiKey = await resolveOpenAIKey(db, userId);

    const imageResult = await generateImage(openaiKey, {
      prompt: customPrompt ?? scene.imagePrompt,
      style: style ?? "realistic",
      size: "1024x1792",
    });

    await db
      .update(jobs)
      .set({ currentStep: "downloading", progress: 50, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    // 3. Download the generated image
    const imageBuffer = await downloadFromUrl(imageResult.url);

    await db
      .update(jobs)
      .set({ currentStep: "uploading-storage", progress: 70, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    // 4. Upload to Supabase Storage
    const filename = `image-${Date.now()}.png`;
    const storageResult = await uploadMedia({
      userId,
      projectId,
      sceneId,
      filename,
      buffer: imageBuffer,
      contentType: "image/png",
    });

    await db
      .update(jobs)
      .set({ currentStep: "saving-asset", progress: 90, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    // 5. Create media_asset row
    const [asset] = await db
      .insert(mediaAssets)
      .values({
        sceneId,
        type: "image",
        url: storageResult.publicUrl,
        storagePath: storageResult.storagePath,
        provider: "openai-dalle3",
        status: "completed",
        metadata: {
          style: style ?? "realistic",
          revisedPrompt: imageResult.revisedPrompt,
          originalPrompt: customPrompt ?? scene.imagePrompt,
        },
      })
      .returning();

    // Mark completed
    await db
      .update(jobs)
      .set({
        status: "completed",
        currentStep: "done",
        progress: 100,
        result: {
          assetId: asset.id,
          url: storageResult.publicUrl,
        },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: { assetId: asset.id },
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
 * Resolve the user's OpenAI API key (plaintext) for image generation.
 * Image generation uses a different SDK method than text generation,
 * so we need the raw key, not the AIProvider abstraction.
 */
async function resolveOpenAIKey(
  db: DrizzleInstance,
  userId: string
): Promise<string> {
  const [keyRow] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.userId, userId),
        eq(apiKeys.provider, "openai"),
        isNull(apiKeys.revokedAt)
      )
    )
    .limit(1);

  if (!keyRow) {
    throw new Error("No OpenAI API key registered. Image generation requires an OpenAI key.");
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
