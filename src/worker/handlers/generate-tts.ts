import type { Job } from "bullmq";
import { eq, and, isNull } from "drizzle-orm";
import { jobs, jobEvents, scenes, mediaAssets, apiKeys } from "@/lib/db/schema";
import { generateTTS, type TTSVoice } from "@/lib/media/tts";
import { removeSilence } from "@/lib/media/silence-removal";
import { uploadMedia } from "@/lib/media/storage";
import { decrypt, getMasterKey } from "@/lib/crypto";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

type GenerateTTSPayload = {
  sceneId: string;
  projectId: string;
  voice: TTSVoice;
  /** Speed multiplier: 0.5 to 2.0 */
  speed?: number;
  /** Whether to auto-remove silence after generation */
  removeSilence?: boolean;
  /** Custom text override (for regeneration with edited narration) */
  customText?: string;
};

/**
 * Generate TTS audio for a scene using OpenAI TTS.
 * Steps:
 * 1. Load scene to get narration text
 * 2. Resolve OpenAI API key
 * 3. Generate TTS audio
 * 4. Optionally remove silence
 * 5. Upload to Supabase Storage
 * 6. Create media_asset row
 */
export async function handleGenerateTTS(
  job: Job,
  db: DrizzleInstance
) {
  const jobId = job.data.jobId as string;
  const userId = job.data.userId as string;
  const payload = job.data.payload as GenerateTTSPayload;
  const {
    sceneId,
    projectId,
    voice,
    speed,
    removeSilence: shouldRemoveSilence,
    customText,
  } = payload;

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
      data: { sceneId, voice, speed },
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
      .set({ currentStep: "generating-tts", progress: 20, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    // 2. Resolve OpenAI API key
    const openaiKey = await resolveOpenAIKey(db, userId);

    // 3. Generate TTS audio
    const ttsResult = await generateTTS(openaiKey, {
      text: customText ?? scene.narration,
      voice: voice ?? "nova",
      speed: speed ?? 1.0,
      format: "mp3",
    });

    let finalBuffer = ttsResult.audioBuffer;

    // 4. Optionally remove silence
    if (shouldRemoveSilence !== false) {
      await db
        .update(jobs)
        .set({ currentStep: "removing-silence", progress: 50, updatedAt: new Date() })
        .where(eq(jobs.id, jobId));

      try {
        finalBuffer = await removeSilence(ttsResult.audioBuffer, {
          minSilenceDuration: 0.3,
          silenceThreshold: -30,
          padding: 0.1,
        });
      } catch (silenceError) {
        // Silence removal is optional -- if it fails, use original audio
        console.warn("Silence removal failed, using original audio:", silenceError);
      }
    }

    await db
      .update(jobs)
      .set({ currentStep: "uploading-storage", progress: 70, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    // 5. Upload to Supabase Storage
    const filename = `tts-${Date.now()}.${ttsResult.extension}`;
    const storageResult = await uploadMedia({
      userId,
      projectId,
      sceneId,
      filename,
      buffer: finalBuffer,
      contentType: ttsResult.contentType,
    });

    await db
      .update(jobs)
      .set({ currentStep: "saving-asset", progress: 90, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    // 6. Create media_asset row
    const [asset] = await db
      .insert(mediaAssets)
      .values({
        sceneId,
        type: "audio",
        url: storageResult.publicUrl,
        storagePath: storageResult.storagePath,
        provider: "openai-tts",
        status: "completed",
        metadata: {
          voice,
          speed: speed ?? 1.0,
          silenceRemoved: shouldRemoveSilence !== false,
          originalText: customText ?? scene.narration,
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
 * Resolve the user's OpenAI API key (plaintext) for TTS.
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
    throw new Error("No OpenAI API key registered. TTS requires an OpenAI key.");
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
