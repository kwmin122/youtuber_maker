import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { getServiceRoleClient } from "@/lib/supabase";

/**
 * Phase 8 (D-07): all avatar video storage operations run through the
 * service-role Supabase client because Better Auth sessions do not
 * satisfy `auth.uid()` in RLS. Caller must enforce ownership via Drizzle
 * BEFORE invoking anything here — RLS is defense in depth (PLANS.md rule 2).
 */

const BUCKET = "generated-media"; // reuse the existing media bucket

/**
 * Upload an avatar lipsync mp4 under a deterministic idempotent path
 * `<userId>/<sceneId>/avatar.mp4`. The idempotent path + `upsert: true`
 * guarantee that a retried BullMQ job overwrites the prior attempt
 * instead of creating a duplicate.
 *
 * Mirrors `uploadLongformSourceFromPath` — no full-file buffering on
 * the Node heap (PLANS.md rule 5).
 */
export async function uploadAvatarVideoFromPath(params: {
  userId: string;
  sceneId: string;
  localPath: string;
}): Promise<{ storagePath: string; publicUrl: string }> {
  const supabase = getServiceRoleClient();
  const storagePath = `${params.userId}/${params.sceneId}/avatar.mp4`;

  // Signed upload URL + streaming PUT (PLANS.md rule 6: upsert: true)
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: true });
  if (signErr || !signed) {
    throw new Error(`avatar video signed upload url failed: ${signErr?.message ?? "unknown"}`);
  }

  const stats = await stat(params.localPath);
  const res = await fetch(signed.signedUrl, {
    method: "PUT",
    headers: {
      "content-type": "video/mp4",
      "content-length": String(stats.size),
      "x-upsert": "true",
    },
    body: createReadStream(params.localPath) as unknown as BodyInit,
    // undici requires `duplex: 'half'` for streaming request bodies
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  if (!res.ok) {
    throw new Error(`avatar video streaming PUT failed (${res.status}): ${await res.text()}`);
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return { storagePath, publicUrl: pub.publicUrl };
}

/**
 * Delete a stale avatar video object. Used when regenerating (D-12) to
 * clean up the prior attempt's orphaned object.
 */
export async function deleteAvatarVideoObject(storagePath: string): Promise<void> {
  const { error } = await getServiceRoleClient()
    .storage.from(BUCKET)
    .remove([storagePath]);
  if (error) {
    throw new Error(`avatar video delete failed: ${error.message}`);
  }
}
