import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { avatarAssets } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import { deleteAvatarReferenceObject } from "@/lib/media/avatar-reference-storage";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const [row] = await db
    .select()
    .from(avatarAssets)
    .where(eq(avatarAssets.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (row.userId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Storage first, then DB. Storage delete is idempotent.
  try {
    await deleteAvatarReferenceObject(row.storagePath);
  } catch (err) {
    console.warn(
      `[avatar-assets DELETE] storage delete failed for ${row.storagePath}: ${(err as Error).message}`
    );
    // continue — DB row deletion proceeds so the user isn't stuck.
    // A periodic sweeper should reconcile orphans.
  }

  await db.delete(avatarAssets).where(eq(avatarAssets.id, id));
  return NextResponse.json({ deleted: true });
}
