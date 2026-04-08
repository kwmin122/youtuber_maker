import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { voiceProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getServerSession } from "@/lib/auth/get-session";
import { deleteFromStorage } from "@/lib/media/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [profile] = await db
    .select()
    .from(voiceProfiles)
    .where(
      and(
        eq(voiceProfiles.id, id),
        eq(voiceProfiles.userId, session.user.id)
      )
    )
    .limit(1);

  if (!profile) {
    return NextResponse.json({ error: "Voice profile not found" }, { status: 404 });
  }

  return NextResponse.json({ profile });
}

/**
 * Delete a voice profile and its associated voice sample from storage.
 * This enables users to withdraw consent and remove their voice data.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Find the profile (scoped to user)
  const [profile] = await db
    .select()
    .from(voiceProfiles)
    .where(
      and(
        eq(voiceProfiles.id, id),
        eq(voiceProfiles.userId, session.user.id)
      )
    )
    .limit(1);

  if (!profile) {
    return NextResponse.json({ error: "Voice profile not found" }, { status: 404 });
  }

  // Delete voice sample from Supabase Storage
  try {
    await deleteFromStorage("voice-samples", profile.sampleStoragePath);
  } catch (storageError) {
    console.warn("Failed to delete voice sample from storage:", storageError);
    // Continue with DB deletion even if storage deletion fails
  }

  // Delete profile from database
  await db
    .delete(voiceProfiles)
    .where(eq(voiceProfiles.id, id));

  return NextResponse.json({ deleted: true });
}
