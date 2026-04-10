import { randomUUID } from "crypto";
import { getServiceRoleClient } from "@/lib/supabase";

const BUCKET = "avatar-references";
const SIGNED_DOWNLOAD_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Phase 8 (D-04): all `avatar-references` reads/writes run through the
 * service-role client because the bucket is PRIVATE and Better Auth
 * sessions do not satisfy `auth.uid()` in Supabase RLS. The caller MUST
 * enforce `session.user.id` ownership via Drizzle BEFORE invoking
 * anything in this module — RLS is defense in depth (PLANS.md rule 4).
 */
function getClient() {
  return getServiceRoleClient();
}

export type AvatarReferenceUploadTarget = {
  storagePath: string;
  signedUrl: string;
  token: string;
};

/**
 * Issue a signed upload URL into the `avatar-references` bucket at a
 * deterministic path `<userId>/<uuid>.<ext>`. The caller passes `ext`
 * so we keep it in the path for downstream content-type detection.
 *
 * `{ upsert: true }` is critical for retry safety: if the client
 * retries the upload (e.g. network blip), the same path can be
 * overwritten without surfacing a 409.
 */
export async function createAvatarReferenceUploadUrl(params: {
  userId: string;
  ext: "jpg" | "jpeg" | "png" | "webp";
}): Promise<AvatarReferenceUploadTarget> {
  const supabase = getClient();
  const storagePath = `${params.userId}/${randomUUID()}.${params.ext}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: true });

  if (error || !data) {
    throw new Error(`avatar-reference signed upload URL failed: ${error?.message ?? "unknown"}`);
  }

  return {
    storagePath,
    signedUrl: data.signedUrl,
    token: data.token,
  };
}

/**
 * Issue a short-lived signed DOWNLOAD URL so that the Plan 08-04
 * worker can pass the reference photo to HeyGen / D-ID, and so the UI
 * in 08-05 can preview uploaded references. Bucket is private, so
 * direct `getPublicUrl` would 404.
 */
export async function createAvatarReferenceDownloadUrl(
  storagePath: string
): Promise<string> {
  const { data, error } = await getClient()
    .storage.from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_DOWNLOAD_TTL_SECONDS);
  if (error || !data) {
    throw new Error(`avatar-reference signed download URL failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

/**
 * Delete the storage object backing an avatar_assets row. Idempotent —
 * calls against missing paths return a success from Supabase Storage.
 */
export async function deleteAvatarReferenceObject(
  storagePath: string
): Promise<void> {
  const { error } = await getClient().storage.from(BUCKET).remove([storagePath]);
  if (error) {
    throw new Error(`avatar-reference delete failed: ${error.message}`);
  }
}
