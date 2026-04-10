import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects, thumbnails, jobs } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
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

const thumbnailRequestSchema = z.object({
  title: z.string().optional(),
  style: z.string().optional(),
  variantCount: z.number().int().min(1).max(3).optional().default(2),
});

/** POST -- Trigger thumbnail generation job */
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = thumbnailRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { title, style, variantCount } = parsed.data;

  const [created] = await db
    .insert(jobs)
    .values({
      userId: session.user.id,
      type: "generate-thumbnail",
      projectId,
      status: "pending",
      progress: 0,
      payload: { projectId, title, style, variantCount },
    })
    .returning();

  await getQueue().add("generate-thumbnail", {
    payload: { projectId, title, style, variantCount },
    jobId: created.id,
    userId: session.user.id,
  });

  return NextResponse.json(
    { jobId: created.id, status: "pending" },
    { status: 201 }
  );
}

/** GET -- List all thumbnails for this project */
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

  const thumbnailList = await db
    .select({
      id: thumbnails.id,
      url: thumbnails.url,
      variant: thumbnails.variant,
      prompt: thumbnails.prompt,
      isSelected: thumbnails.isSelected,
      createdAt: thumbnails.createdAt,
    })
    .from(thumbnails)
    .where(eq(thumbnails.projectId, projectId))
    .orderBy(asc(thumbnails.variant));

  return NextResponse.json(thumbnailList);
}
