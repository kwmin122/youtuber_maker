import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects, uploads, jobs } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getServerSession } from "@/lib/auth/get-session";
import { getQueue } from "@/lib/queue";

type RouteParams = { params: Promise<{ id: string }> };

async function verifyProjectOwnership(projectId: string, userId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return project || null;
}

const uploadSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(5000).optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  privacyStatus: z.enum(["private", "unlisted", "public"]).optional().default("private"),
  publishAt: z.string().datetime().optional(),
  thumbnailId: z.string().uuid().optional(),
});

/** POST -- Trigger a YouTube upload job */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const project = await verifyProjectOwnership(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.exportedVideoUrl) {
    return NextResponse.json(
      { error: "No exported video. Please export the video first." },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { title, description, tags, privacyStatus, publishAt, thumbnailId } =
    parsed.data;

  // Create job row
  const [created] = await db
    .insert(jobs)
    .values({
      userId: session.user.id,
      type: "upload-youtube",
      projectId,
      status: "pending",
      progress: 0,
      payload: { projectId, title, description, tags, privacyStatus, publishAt, thumbnailId },
    })
    .returning();

  // Enqueue to BullMQ
  await getQueue().add("upload-youtube", {
    payload: { projectId, title, description, tags, privacyStatus, publishAt, thumbnailId },
    jobId: created.id,
    userId: session.user.id,
  });

  return NextResponse.json(
    { jobId: created.id, status: "pending" },
    { status: 201 }
  );
}

/** GET -- Get upload history for this project */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const project = await verifyProjectOwnership(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const uploadList = await db
    .select({
      id: uploads.id,
      platform: uploads.platform,
      youtubeVideoId: uploads.youtubeVideoId,
      videoUrl: uploads.videoUrl,
      title: uploads.title,
      status: uploads.status,
      privacyStatus: uploads.privacyStatus,
      publishAt: uploads.publishAt,
      uploadedAt: uploads.uploadedAt,
      errorMessage: uploads.errorMessage,
      createdAt: uploads.createdAt,
    })
    .from(uploads)
    .where(eq(uploads.projectId, projectId))
    .orderBy(desc(uploads.createdAt));

  return NextResponse.json(uploadList);
}
