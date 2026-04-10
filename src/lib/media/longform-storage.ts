import { createSupabaseClient } from "@/lib/supabase";
import { LONGFORM_BUCKET } from "@/lib/video/longform-constants";

/**
 * Helpers for reading and writing longform source videos from the
 * Supabase Storage `longform-sources` bucket. Mirrors the role that
 * `@/lib/media/storage.ts` plays for per-scene media, but kept in a
 * separate file to avoid bloating the core storage module.
 */

export type LongformUploadResult = {
  storagePath: string;
  publicUrl: string;
};

/**
 * Upload a downloaded source buffer under a deterministic path
 * `<userId>/<sourceId>/source.mp4`. Uses `upsert: true` so that a
 * retried job overwrites a previous partial upload.
 */
export async function uploadLongformSource(params: {
  userId: string;
  sourceId: string;
  buffer: Buffer;
}): Promise<LongformUploadResult> {
  const supabase = createSupabaseClient();
  const storagePath = `${params.userId}/${params.sourceId}/source.mp4`;

  const { error } = await supabase.storage
    .from(LONGFORM_BUCKET)
    .upload(storagePath, params.buffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (error) {
    throw new Error(`Longform upload failed: ${error.message}`);
  }

  const { data } = supabase.storage
    .from(LONGFORM_BUCKET)
    .getPublicUrl(storagePath);

  return { storagePath, publicUrl: data.publicUrl };
}

/**
 * Download a longform source from Supabase Storage into a Buffer.
 * Used by the handler when the source was direct-uploaded by the
 * user via a signed URL and we need the bytes on the worker's disk
 * for ffprobe / clipping.
 */
export async function downloadLongformSource(
  storagePath: string
): Promise<Buffer> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.storage
    .from(LONGFORM_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(
      `Longform download failed: ${error?.message ?? "unknown error"}`
    );
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Resolve the public URL for an already-uploaded source. Used when
 * the file mode path didn't need a re-upload.
 */
export function getLongformPublicUrl(storagePath: string): string {
  const supabase = createSupabaseClient();
  const { data } = supabase.storage
    .from(LONGFORM_BUCKET)
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

/**
 * Delete a longform source from storage (cleanup / GDPR).
 */
export async function deleteLongformSource(
  storagePath: string
): Promise<void> {
  const supabase = createSupabaseClient();
  const { error } = await supabase.storage
    .from(LONGFORM_BUCKET)
    .remove([storagePath]);
  if (error) {
    throw new Error(`Longform delete failed: ${error.message}`);
  }
}
