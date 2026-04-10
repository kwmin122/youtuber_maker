import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { scenes, scripts, projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getServerSession } from "@/lib/auth/get-session";

const transitionSchema = z.object({
  transitionType: z.enum(["fade", "dissolve", "slide-left", "slide-right", "zoom-in", "cut"]),
  transitionDuration: z.number().min(0).max(1.0).default(0.5),
});

type RouteParams = { params: Promise<{ id: string; sceneId: string }> };

/**
 * Verify scene ownership: scene -> script -> project -> user
 */
async function verifySceneOwnership(sceneId: string, userId: string) {
  const [scene] = await db
    .select()
    .from(scenes)
    .where(eq(scenes.id, sceneId))
    .limit(1);

  if (!scene) return null;
  if (!scene.scriptId) return null;

  const [script] = await db
    .select()
    .from(scripts)
    .where(eq(scripts.id, scene.scriptId))
    .limit(1);

  if (!script) return null;

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, script.projectId), eq(projects.userId, userId)))
    .limit(1);

  if (!project) return null;

  return scene;
}

/** GET — Return current transition settings for a scene */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sceneId } = await params;
  const scene = await verifySceneOwnership(sceneId, session.user.id);

  if (!scene) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  return NextResponse.json({
    transitionType: scene.transitionType || "cut",
    transitionDuration: scene.transitionDuration || 0.5,
  });
}

/** PUT — Update transition for a scene */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sceneId } = await params;
  const scene = await verifySceneOwnership(sceneId, session.user.id);

  if (!scene) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = transitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Duration is ignored for "cut" transitions
  const transitionDuration = parsed.data.transitionType === "cut" ? 0 : parsed.data.transitionDuration;

  const [updated] = await db
    .update(scenes)
    .set({
      transitionType: parsed.data.transitionType,
      transitionDuration,
      updatedAt: new Date(),
    })
    .where(eq(scenes.id, sceneId))
    .returning();

  return NextResponse.json({
    transitionType: updated.transitionType,
    transitionDuration: updated.transitionDuration,
  });
}
