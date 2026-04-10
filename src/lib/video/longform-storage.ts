import { createSupabaseClient } from "@/lib/supabase";
import { LONGFORM_BUCKET } from "@/lib/video/longform-constants";

/**
 * Download the source video for a longform_sources row from Supabase
 * Storage. Returns a Buffer the worker can write to tempDir before
 * running ffmpeg / ffprobe / Gemini upload.
 *
 * Phase 7 only — non-longform downloads use `downloadFromUrl` in
 * `src/lib/media/storage.ts`.
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
      `longform storage download failed: ${error?.message ?? "no data"} (${storagePath})`
    );
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
