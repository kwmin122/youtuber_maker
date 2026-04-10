import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { getServiceRoleClient } from "@/lib/supabase";
import { LONGFORM_BUCKET } from "@/lib/video/longform-constants";

/**
 * Phase 7 retry 2, Codex CRITICAL-4: all longform storage ops run
 * through the service-role Supabase client because Better Auth
 * sessions are not Supabase Auth JWTs, so `auth.uid()` in RLS
 * policies is always NULL from the anon client. The caller MUST
 * have enforced `session.user.id` ownership on the source row via
 * Drizzle before invoking anything in this module — RLS is defense
 * in depth, not the primary auth check.
 */
function getClient() {
  return getServiceRoleClient();
}

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
  const supabase = getClient();
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
 * Upload a longform source by streaming bytes from a local file path
 * directly to Supabase Storage via a signed upload URL + fetch PUT.
 *
 * Bypasses `readFile(path)` -> Buffer -> `.upload(buffer)`, which
 * peaks at (file size) of worker RAM and OOMs Railway on 2 GB inputs.
 * Instead we:
 *   1. Ask Supabase Storage for a signed upload URL for the target
 *      path.
 *   2. Open the file as a Node read stream and PUT it directly. Uses
 *      `duplex: 'half'` because Node's undici requires it for
 *      streaming request bodies, and sets `content-length` from a
 *      stat() so S3 accepts the upload without chunked transfer.
 *   3. On failure we throw -- the caller's `catch` is responsible for
 *      deleting any orphan object.
 */
export async function uploadLongformSourceFromPath(params: {
  userId: string;
  sourceId: string;
  filePath: string;
  contentType?: string;
}): Promise<LongformUploadResult> {
  const supabase = getClient();
  const storagePath = `${params.userId}/${params.sourceId}/source.mp4`;
  const contentType = params.contentType ?? "video/mp4";

  // Pass `{ upsert: true }` at sign-time so retries can overwrite a
  // previous partial upload without a "duplicate" error. Per
  // @supabase/storage-js StorageFileApi.ts:347, upsert must be set at
  // signing time (not at upload time) for signed-URL uploads.
  // Confirmed supported in storage-js v2.102.1 (installed version).
  const { data: signed, error: signErr } = await supabase.storage
    .from(LONGFORM_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: true });

  if (signErr || !signed) {
    throw new Error(
      `Longform signed upload URL failed: ${signErr?.message ?? "unknown error"}`
    );
  }

  const fileInfo = await stat(params.filePath);
  const stream = createReadStream(params.filePath);

  const res = await fetch(signed.signedUrl, {
    method: "PUT",
    body: stream as unknown as BodyInit,
    // `duplex: 'half'` is required by undici / Node fetch when the
    // request body is a readable stream. TypeScript's `RequestInit`
    // does not yet declare `duplex`, so we cast.
    // @ts-expect-error duplex is a valid Node fetch option
    duplex: "half",
    headers: {
      "content-type": contentType,
      "content-length": String(fileInfo.size),
      "x-upsert": "true",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Longform streaming upload failed: ${res.status} ${res.statusText} ${text.slice(0, 300)}`
    );
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
 *
 * NOTE: buffers the entire file in memory and should only be used
 * for paths where we already know the file fits (e.g. small test
 * fixtures). For worker production paths that must handle up to
 * LONGFORM_MAX_DURATION content, prefer
 * `downloadLongformSourceToPath`.
 */
export async function downloadLongformSource(
  storagePath: string
): Promise<Buffer> {
  const supabase = getClient();
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
 * Stream a longform source from Supabase Storage to a local file
 * path, without ever holding the full bytes in RAM. Uses a signed
 * download URL + fetch + streamed pipe to a file descriptor, which
 * lets Node keep memory bounded to a single chunk at a time.
 */
export async function downloadLongformSourceToPath(params: {
  storagePath: string;
  destPath: string;
}): Promise<void> {
  const supabase = getClient();
  const { data: signed, error: signErr } = await supabase.storage
    .from(LONGFORM_BUCKET)
    .createSignedUrl(params.storagePath, 60 * 10);

  if (signErr || !signed) {
    throw new Error(
      `Longform signed download URL failed: ${signErr?.message ?? "unknown error"}`
    );
  }

  const res = await fetch(signed.signedUrl);
  if (!res.ok || !res.body) {
    throw new Error(
      `Longform streaming download failed: ${res.status} ${res.statusText}`
    );
  }

  const { createWriteStream } = await import("fs");
  const { Readable } = await import("stream");
  const { pipeline } = await import("stream/promises");

  const nodeStream = Readable.fromWeb(
    res.body as unknown as import("stream/web").ReadableStream
  );
  const out = createWriteStream(params.destPath);
  await pipeline(nodeStream, out);
}

/**
 * Resolve the public URL for an already-uploaded source. Used when
 * the file mode path didn't need a re-upload.
 */
export function getLongformPublicUrl(storagePath: string): string {
  const supabase = getClient();
  const { data } = supabase.storage
    .from(LONGFORM_BUCKET)
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

/**
 * Upload a clipped 9:16 MP4 produced by the longform-clip handler
 * into the v1 `media` bucket under a stable per-user path. Using the
 * flat path `<userId>/longform-clips/<candidateId>.mp4` avoids the
 * chicken-and-egg problem of needing a project id before we've
 * created the child project row. The `media_assets.storagePath` is
 * persisted in DB so later deletion does not rely on path convention.
 */
export async function uploadLongformClipBuffer(params: {
  userId: string;
  candidateId: string;
  buffer: Buffer;
}): Promise<LongformUploadResult> {
  const supabase = getClient();
  const storagePath = `${params.userId}/longform-clips/${params.candidateId}.mp4`;

  const { error } = await supabase.storage
    .from("media")
    .upload(storagePath, params.buffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (error) {
    throw new Error(`Longform clip upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from("media").getPublicUrl(storagePath);

  return { storagePath, publicUrl: data.publicUrl };
}

/**
 * Streaming variant of `uploadLongformClipBuffer` that uploads a clip
 * mp4 from a local file path without materializing the whole file in
 * RAM. Same destination path convention as the Buffer-based helper.
 */
export async function uploadLongformClipFromPath(params: {
  userId: string;
  candidateId: string;
  filePath: string;
  contentType?: string;
}): Promise<LongformUploadResult> {
  const supabase = getClient();
  const storagePath = `${params.userId}/longform-clips/${params.candidateId}.mp4`;
  const contentType = params.contentType ?? "video/mp4";

  // Pass `{ upsert: true }` at sign-time so retries overwrite existing
  // clips at the same path without a "duplicate" error. Phase 7 retry
  // 3, Codex HIGH-2 fix. Supported in storage-js v2.102.1.
  const { data: signed, error: signErr } = await supabase.storage
    .from("media")
    .createSignedUploadUrl(storagePath, { upsert: true });

  if (signErr || !signed) {
    throw new Error(
      `Longform clip signed upload URL failed: ${signErr?.message ?? "unknown error"}`
    );
  }

  const fileInfo = await stat(params.filePath);
  const stream = createReadStream(params.filePath);

  const res = await fetch(signed.signedUrl, {
    method: "PUT",
    body: stream as unknown as BodyInit,
    // @ts-expect-error duplex is a valid Node fetch option
    duplex: "half",
    headers: {
      "content-type": contentType,
      "content-length": String(fileInfo.size),
      "x-upsert": "true",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Longform clip streaming upload failed: ${res.status} ${res.statusText} ${text.slice(0, 300)}`
    );
  }

  const { data } = supabase.storage.from("media").getPublicUrl(storagePath);

  return { storagePath, publicUrl: data.publicUrl };
}

/**
 * Delete a longform source from storage (cleanup / GDPR).
 */
export async function deleteLongformSource(
  storagePath: string
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.storage
    .from(LONGFORM_BUCKET)
    .remove([storagePath]);
  if (error) {
    throw new Error(`Longform delete failed: ${error.message}`);
  }
}
