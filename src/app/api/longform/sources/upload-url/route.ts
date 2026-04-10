import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { createSupabaseClient } from "@/lib/supabase";
import { getServerSession } from "@/lib/auth/get-session";
import {
  LONGFORM_ALLOWED_MIME_TYPES,
  LONGFORM_BUCKET,
  LONGFORM_MAX_FILE_BYTES,
} from "@/lib/video/longform-constants";

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(LONGFORM_ALLOWED_MIME_TYPES),
  fileSize: z.number().int().positive().max(LONGFORM_MAX_FILE_BYTES),
});

/**
 * Sanitize a user-provided filename: keep the extension, strip
 * path separators and any character that would be ambiguous in a
 * storage key. Prevents things like `../../evil.mp4`.
 */
function sanitizeFilename(input: string): string {
  const base = input.split("/").pop()?.split("\\").pop() ?? "file.mp4";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
}

/**
 * POST /api/longform/sources/upload-url
 *
 * Returns a Supabase Storage signed upload URL so the client can
 * direct-upload a large (up to 2 GB) source video without going
 * through the Vercel serverless request body limit.
 *
 * Response shape:
 *   { storagePath: string, token: string, signedUrl: string }
 *
 * The client uploads with that signed URL, then POSTs
 * `{ sourceType: 'file', storagePath }` to /api/longform/sources
 * to enqueue the download job.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { filename } = parsed.data;
  const safeName = sanitizeFilename(filename);
  const uploadId = randomUUID();
  const storagePath = `${session.user.id}/uploads/${uploadId}/${safeName}`;

  const supabase = createSupabaseClient();
  const { data, error } = await supabase.storage
    .from(LONGFORM_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to sign upload URL" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    storagePath,
    token: data.token,
    signedUrl: data.signedUrl,
  });
}
