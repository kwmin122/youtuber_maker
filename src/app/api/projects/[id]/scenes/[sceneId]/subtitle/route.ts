import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { scenes, scripts, projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getServerSession } from "@/lib/auth/get-session";
import { DEFAULT_SUBTITLE_STYLE } from "@/lib/video/types";

const subtitleStyleSchema = z.object({
  fontFamily: z.string().min(1),
  fontSize: z.number().int().min(16).max(72),
  fontColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  backgroundColor: z.string(), // hex with alpha or 'transparent'
  borderColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  borderWidth: z.number().min(0).max(4),
  shadowColor: z.string(),
  shadowOffset: z.number().min(0).max(4),
  position: z.enum(["top", "center", "bottom"]),
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

/** GET — Return the current subtitle style for a scene */
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
    subtitleStyle: scene.subtitleStyle || DEFAULT_SUBTITLE_STYLE,
  });
}

/** PUT — Update subtitle style for a scene */
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

  const parsed = subtitleStyleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(scenes)
    .set({
      subtitleStyle: parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(scenes.id, sceneId))
    .returning();

  return NextResponse.json({ scene: updated });
}

/** DELETE — Reset subtitle style to null (use defaults) */
export async function DELETE(
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

  await db
    .update(scenes)
    .set({
      subtitleStyle: null,
      updatedAt: new Date(),
    })
    .where(eq(scenes.id, sceneId));

  return NextResponse.json({ subtitleStyle: null });
}
