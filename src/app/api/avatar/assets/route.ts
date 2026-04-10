import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { avatarAssets } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import {
  createAvatarReferenceDownloadUrl,
  deleteAvatarReferenceObject,
} from "@/lib/media/avatar-reference-storage";
import { createHash } from "crypto";

const postSchema = z.object({
  storagePath: z.string().min(1),
  imageHash: z.string().regex(/^[a-f0-9]{64}$/, "sha256 hex required"),
  consent: z.literal(true, {
    error: "consent must be explicitly true",
  }),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { storagePath, imageHash } = parsed.data;

  // IDOR defense: the storagePath prefix MUST start with the caller's
  // user id. Without this check, a malicious client could pass
  // `<other-user-id>/<uuid>.png` and register someone else's image as
  // their own. The bucket-level RLS policy also enforces this, but we
  // belt-and-suspenders it here.
  if (!storagePath.startsWith(`${session.user.id}/`)) {
    return NextResponse.json(
      { error: "storagePath must be scoped to the authenticated user" },
      { status: 403 }
    );
  }

  // Server-side hash verification: fetch the object via a short-lived
  // signed URL and sha256 the bytes. Prevents a client from passing a
  // fake hash to bypass dedupe.
  const downloadUrl = await createAvatarReferenceDownloadUrl(storagePath);
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    return NextResponse.json(
      { error: "uploaded object not found" },
      { status: 404 }
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const serverHash = createHash("sha256").update(buf).digest("hex");
  if (serverHash !== imageHash) {
    // Clean up the rogue upload, then reject
    await deleteAvatarReferenceObject(storagePath).catch(() => {});
    return NextResponse.json(
      { error: "imageHash mismatch" },
      { status: 400 }
    );
  }

  // Dedupe check — return existing row id on conflict
  const [existing] = await db
    .select()
    .from(avatarAssets)
    .where(
      and(
        eq(avatarAssets.userId, session.user.id),
        eq(avatarAssets.imageHash, imageHash)
      )
    )
    .limit(1);

  if (existing) {
    // Delete the freshly-uploaded duplicate object to keep storage clean
    await deleteAvatarReferenceObject(storagePath).catch(() => {});
    return NextResponse.json(
      { id: existing.id, deduped: true },
      { status: 200 }
    );
  }

  // Construct the private "public url" placeholder — since the bucket
  // is private this is purely an internal pointer stored for audit;
  // actual reads always go through createAvatarReferenceDownloadUrl.
  const publicUrlPlaceholder = `supabase://avatar-references/${storagePath}`;

  const [row] = await db
    .insert(avatarAssets)
    .values({
      userId: session.user.id,
      storagePath,
      publicUrl: publicUrlPlaceholder,
      imageHash,
      consentRecordedAt: new Date(),
      status: "ready",
    })
    .returning();

  return NextResponse.json({ id: row.id, deduped: false }, { status: 201 });
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await db
    .select()
    .from(avatarAssets)
    .where(eq(avatarAssets.userId, session.user.id))
    .limit(100);
  return NextResponse.json(rows);
}
