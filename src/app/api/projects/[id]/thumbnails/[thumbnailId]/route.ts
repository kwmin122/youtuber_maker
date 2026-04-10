import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, thumbnails } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getServerSession } from "@/lib/auth/get-session";
import { deleteFromStorage } from "@/lib/media/storage";

type RouteParams = {
  params: Promise<{ id: string; thumbnailId: string }>;
};

async function verifyProjectOwnership(projectId: string, userId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return project || null;
}

/** PATCH -- Select a thumbnail (set isSelected) */
export async function PATCH(
  _request: NextRequest,
  { params }: RouteParams
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, thumbnailId } = await params;
  const project = await verifyProjectOwnership(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Verify thumbnail belongs to this project
  const [thumb] = await db
    .select()
    .from(thumbnails)
    .where(
      and(eq(thumbnails.id, thumbnailId), eq(thumbnails.projectId, projectId))
    )
    .limit(1);

  if (!thumb) {
    return NextResponse.json(
      { error: "Thumbnail not found" },
      { status: 404 }
    );
  }

  // Deselect all thumbnails for this project
  await db
    .update(thumbnails)
    .set({ isSelected: false })
    .where(eq(thumbnails.projectId, projectId));

  // Select the specified thumbnail
  const [updated] = await db
    .update(thumbnails)
    .set({ isSelected: true })
    .where(eq(thumbnails.id, thumbnailId))
    .returning();

  return NextResponse.json(updated);
}

/** DELETE -- Delete a thumbnail */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, thumbnailId } = await params;
  const project = await verifyProjectOwnership(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const [thumb] = await db
    .select()
    .from(thumbnails)
    .where(
      and(eq(thumbnails.id, thumbnailId), eq(thumbnails.projectId, projectId))
    )
    .limit(1);

  if (!thumb) {
    return NextResponse.json(
      { error: "Thumbnail not found" },
      { status: 404 }
    );
  }

  // Delete from Supabase Storage
  try {
    await deleteFromStorage("media", thumb.storagePath);
  } catch (err) {
    console.warn("Failed to delete thumbnail from storage:", err);
    // Continue with DB deletion even if storage delete fails
  }

  // Delete from database
  await db.delete(thumbnails).where(eq(thumbnails.id, thumbnailId));

  return NextResponse.json({ success: true });
}
