import { createSupabaseClient } from "@/lib/supabase";
import type { StorageUploadResult } from "./types";

const MEDIA_BUCKET = "media";

/**
 * Upload a file buffer to Supabase Storage.
 * Path structure: media/{userId}/{projectId}/{sceneId}/{filename}
 */
export async function uploadMedia(params: {
  userId: string;
  projectId: string;
  sceneId: string;
  filename: string;
  buffer: Buffer;
  contentType: string;
}): Promise<StorageUploadResult> {
  const supabase = createSupabaseClient();
  const storagePath = `${params.userId}/${params.projectId}/${params.sceneId}/${params.filename}`;

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, params.buffer, {
      contentType: params.contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(storagePath);

  return {
    storagePath,
    publicUrl: urlData.publicUrl,
  };
}

/**
 * Upload voice sample to Supabase Storage.
 * Path structure: voice-samples/{userId}/{filename}
 */
export async function uploadVoiceSample(params: {
  userId: string;
  filename: string;
  buffer: Buffer;
  contentType: string;
}): Promise<StorageUploadResult> {
  const supabase = createSupabaseClient();
  const storagePath = `${params.userId}/${params.filename}`;
  const bucket = "voice-samples";

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, params.buffer, {
      contentType: params.contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Voice sample upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(storagePath);

  return {
    storagePath,
    publicUrl: urlData.publicUrl,
  };
}

/**
 * Delete a file from Supabase Storage.
 * Used for voice sample deletion (consent withdrawal) and media regeneration.
 */
export async function deleteFromStorage(
  bucket: string,
  storagePath: string
): Promise<void> {
  const supabase = createSupabaseClient();
  const { error } = await supabase.storage
    .from(bucket)
    .remove([storagePath]);

  if (error) {
    throw new Error(`Storage delete failed: ${error.message}`);
  }
}

/**
 * Download a file from a URL and return it as a Buffer.
 * Used to download provider-generated images/videos before uploading to our storage.
 */
export async function downloadFromUrl(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
