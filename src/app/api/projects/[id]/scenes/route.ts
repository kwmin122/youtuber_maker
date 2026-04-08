import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scenes, scripts } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getServerSession } from "@/lib/auth/get-session";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  // Get the selected script for this project
  const [selectedScript] = await db
    .select()
    .from(scripts)
    .where(
      and(
        eq(scripts.projectId, projectId),
        eq(scripts.isSelected, true)
      )
    )
    .limit(1);

  if (!selectedScript) {
    return NextResponse.json({ scenes: [], scriptId: null });
  }

  // Get scenes ordered by sceneIndex
  const projectScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.scriptId, selectedScript.id))
    .orderBy(asc(scenes.sceneIndex));

  return NextResponse.json({
    scenes: projectScenes,
    scriptId: selectedScript.id,
  });
}
