import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audioTracks, projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getServerSession } from "@/lib/auth/get-session";
import { uploadMedia } from "@/lib/media/storage";

const addTrackSchema = z.object({
  type: z.enum(["bgm", "sfx"]),
  name: z.string().min(1),
  libraryId: z.string().optional(),
  url: z.string().url().optional(),
  startTime: z.number().min(0).default(0),
  endTime: z.number().min(0).nullable().optional(),
  volume: z.number().min(0).max(1).default(0.3),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Verify project ownership.
 */
async function verifyProjectOwnership(projectId: string, userId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  return project || null;
}

/** GET — List all audio tracks for a project */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const project = await verifyProjectOwnership(projectId, session.user.id);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const tracks = await db
    .select()
    .from(audioTracks)
    .where(eq(audioTracks.projectId, projectId));

  return NextResponse.json({ tracks });
}

/** POST — Add a new audio track (library selection or file upload) */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const project = await verifyProjectOwnership(projectId, session.user.id);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") || "";

  // Handle multipart file upload
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string;
    const name = formData.get("name") as string;
    const startTime = parseFloat(formData.get("startTime") as string || "0");
    const endTime = formData.get("endTime") ? parseFloat(formData.get("endTime") as string) : null;
    const volume = parseFloat(formData.get("volume") as string || "0.3");

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (!type || !["bgm", "sfx"].includes(type)) {
      return NextResponse.json({ error: "Type must be 'bgm' or 'sfx'" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `audio-${Date.now()}-${file.name}`;
    const uploaded = await uploadMedia({
      userId: session.user.id,
      projectId,
      sceneId: "audio",
      filename,
      buffer,
      contentType: file.type || "audio/mpeg",
    });

    const [track] = await db
      .insert(audioTracks)
      .values({
        projectId,
        type,
        name,
        url: uploaded.publicUrl,
        storagePath: uploaded.storagePath,
        startTime,
        endTime,
        volume,
      })
      .returning();

    return NextResponse.json({ track }, { status: 201 });
  }

  // Handle JSON body (library selection)
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = addTrackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { type, name, url, startTime, endTime, volume } = parsed.data;

  if (!url) {
    return NextResponse.json(
      { error: "url is required for library selection" },
      { status: 400 }
    );
  }

  const [track] = await db
    .insert(audioTracks)
    .values({
      projectId,
      type,
      name,
      url,
      storagePath: "", // library tracks have no user-uploaded storage path
      startTime,
      endTime: endTime ?? null,
      volume,
    })
    .returning();

  return NextResponse.json({ track }, { status: 201 });
}
