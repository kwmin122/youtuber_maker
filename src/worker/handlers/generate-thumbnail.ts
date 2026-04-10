import type { Job } from "bullmq";
import { eq, and, isNull } from "drizzle-orm";
import { projects, scripts, thumbnails, jobs, jobEvents, apiKeys } from "@/lib/db/schema";
import { generateThumbnails } from "@/lib/distribution/thumbnail-generator";
import { downloadFromUrl } from "@/lib/media/storage";
import { createSupabaseClient } from "@/lib/supabase";
import { decrypt, getMasterKey, type EncryptedPayload } from "@/lib/crypto";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

const THUMBNAIL_BUCKET = "media";

/**
 * Handle thumbnail generation job.
 *
 * Expected payload:
 * - projectId: string
 * - title?: string (if not provided, use project title)
 * - style?: string
 * - variantCount?: number (default 2)
 */
export async function handleGenerateThumbnail(job: Job, db: DrizzleInstance) {
  const { jobId, userId, payload } = job.data;
  const { projectId, title, style, variantCount = 2 } = payload;

  if (!projectId) {
    throw new Error("projectId is required in payload");
  }

  try {
    // Update job status
    await db
      .update(jobs)
      .set({ status: "active", progress: 0, currentStep: "loading-data", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "started",
      data: { projectId },
    });

    // 1. Load project and selected script
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1);

    if (!project) {
      throw new Error("Project not found or unauthorized");
    }

    const [selectedScript] = await db
      .select()
      .from(scripts)
      .where(
        and(eq(scripts.projectId, projectId), eq(scripts.isSelected, true))
      )
      .limit(1);

    const scriptContent = selectedScript?.content || project.title || "";
    const thumbnailTitle = title || project.title;

    // 2. Get OpenAI API key (required for DALL-E 3)
    await db
      .update(jobs)
      .set({ progress: 10, currentStep: "resolving-api-key", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

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
      throw new Error(
        "OpenAI API key required for thumbnail generation. Please add an OpenAI key in Settings."
      );
    }

    // Decrypt the API key
    const masterKey = getMasterKey();
    const encryptedPayload: EncryptedPayload = {
      keyVersion: keyRow.keyVersion,
      encryptedDek: keyRow.encryptedDek,
      dekIv: keyRow.dekIv,
      dekAuthTag: keyRow.dekAuthTag,
      ciphertext: keyRow.ciphertext,
      dataIv: keyRow.dataIv,
      dataAuthTag: keyRow.dataAuthTag,
    };
    const openaiApiKey = decrypt(encryptedPayload, masterKey);

    // 3. Generate thumbnails
    await db
      .update(jobs)
      .set({ progress: 20, currentStep: "generating-thumbnails", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    const results = await generateThumbnails({
      apiKey: openaiApiKey,
      request: {
        projectId,
        scriptContent,
        title: thumbnailTitle,
        style,
        variantCount,
      },
    });

    // 4. Download and upload each thumbnail to Supabase Storage
    const supabase = createSupabaseClient();
    const thumbnailIds: string[] = [];
    const totalVariants = results.length;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const progressBase = 40 + Math.round((i / totalVariants) * 40);

      await db
        .update(jobs)
        .set({
          progress: progressBase,
          currentStep: `storing-thumbnail-${result.variant}`,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      try {
        // Download from DALL-E temporary URL
        const imageBuffer = await downloadFromUrl(result.url);

        // Upload to Supabase Storage
        const storagePath = `thumbnails/${userId}/${projectId}/thumb-${result.variant}.png`;
        const { error: uploadError } = await supabase.storage
          .from(THUMBNAIL_BUCKET)
          .upload(storagePath, imageBuffer, {
            contentType: "image/png",
            upsert: true,
          });

        if (uploadError) {
          console.warn(`Failed to upload thumbnail ${result.variant}:`, uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from(THUMBNAIL_BUCKET)
          .getPublicUrl(storagePath);

        // Insert thumbnail row
        const [thumbRow] = await db
          .insert(thumbnails)
          .values({
            projectId,
            url: urlData.publicUrl,
            storagePath,
            variant: result.variant,
            prompt: result.prompt,
            isSelected: false,
          })
          .returning();

        thumbnailIds.push(thumbRow.id);
      } catch (err) {
        console.warn(
          `Failed to process thumbnail variant ${result.variant}:`,
          err instanceof Error ? err.message : err
        );
        // Continue with remaining variants
      }
    }

    // 5. Select first variant as default
    if (thumbnailIds.length > 0) {
      await db
        .update(thumbnails)
        .set({ isSelected: true })
        .where(eq(thumbnails.id, thumbnailIds[0]));
    }

    // 6. Finalize
    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: 100,
        currentStep: "complete",
        result: { thumbnailIds, count: thumbnailIds.length },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: { thumbnailIds },
    });

    return { thumbnailIds };
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
