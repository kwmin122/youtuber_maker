import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audioTracks, projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getServerSession } from "@/lib/auth/get-session";
import { deleteFromStorage } from "@/lib/media/storage";

const updateTrackSchema = z.object({
  startTime: z.number().min(0).optional(),
  endTime: z.number().min(0).nullable().optional(),
  volume: z.number().min(0).max(1).optional(),
  name: z.string().min(1).optional(),
});

type RouteParams = { params: Promise<{ id: string; trackId: string }> };

/**
 * Verify audio track ownership: track -> project -> user
 */
async function verifyTrackOwnership(trackId: string, projectId: string, userId: string) {
  // First verify project ownership
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (!project) return null;

  // Then verify track belongs to this project
  const [track] = await db
    .select()
    .from(audioTracks)
    .where(and(eq(audioTracks.id, trackId), eq(audioTracks.projectId, projectId)))
    .limit(1);

  return track || null;
}

/** PUT — Update an audio track's timing/volume */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, trackId } = await params;
  const track = await verifyTrackOwnership(trackId, projectId, session.user.id);

  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateTrackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.startTime !== undefined) updateData.startTime = parsed.data.startTime;
  if (parsed.data.endTime !== undefined) updateData.endTime = parsed.data.endTime;
  if (parsed.data.volume !== undefined) updateData.volume = parsed.data.volume;
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;

  const [updated] = await db
    .update(audioTracks)
    .set(updateData)
    .where(eq(audioTracks.id, trackId))
    .returning();

  return NextResponse.json({ track: updated });
}

/** DELETE — Remove an audio track */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, trackId } = await params;
  const track = await verifyTrackOwnership(trackId, projectId, session.user.id);

  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  // Delete from Supabase Storage if storage path exists
  if (track.storagePath) {
    try {
      await deleteFromStorage("media", track.storagePath);
    } catch {
      // Storage deletion is best-effort; continue with DB deletion
    }
  }

  // Delete from database
  await db.delete(audioTracks).where(eq(audioTracks.id, trackId));

  return NextResponse.json({ success: true });
}
