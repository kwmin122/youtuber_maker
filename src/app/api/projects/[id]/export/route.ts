import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, scripts, scenes, mediaAssets, jobs } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getServerSession } from "@/lib/auth/get-session";
import { getQueue } from "@/lib/queue";

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

/** POST — Trigger a video export job */
export async function POST(
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

  // Find the selected script for this project
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
    return NextResponse.json(
      { error: "No selected script found. Please select a script first." },
      { status: 400 }
    );
  }

  // Validate that scenes with completed media exist
  const projectScenes = await db
    .select({ id: scenes.id })
    .from(scenes)
    .where(eq(scenes.scriptId, selectedScript.id));

  if (projectScenes.length === 0) {
    return NextResponse.json(
      { error: "No scenes found for the selected script." },
      { status: 400 }
    );
  }

  // Check at least one scene has completed media
  let hasMedia = false;
  for (const scene of projectScenes) {
    const [asset] = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.sceneId, scene.id),
          eq(mediaAssets.status, "completed")
        )
      )
      .limit(1);

    if (asset) {
      hasMedia = true;
      break;
    }
  }

  if (!hasMedia) {
    return NextResponse.json(
      { error: "No completed media assets found. Generate images/videos first." },
      { status: 400 }
    );
  }

  // Create job row
  const [created] = await db
    .insert(jobs)
    .values({
      userId: session.user.id,
      type: "export-video",
      projectId,
      status: "pending",
      progress: 0,
      payload: { projectId, scriptId: selectedScript.id },
    })
    .returning();

  // Enqueue to BullMQ
  await getQueue().add("export-video", {
    payload: { projectId, scriptId: selectedScript.id },
    jobId: created.id,
    userId: session.user.id,
  });

  return NextResponse.json(
    { jobId: created.id, status: "pending" },
    { status: 201 }
  );
}

/** GET — Get export status and result */
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

  // Get the latest export-video job for this project
  const [latestJob] = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      progress: jobs.progress,
      currentStep: jobs.currentStep,
      errorMessage: jobs.errorMessage,
      result: jobs.result,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.projectId, projectId),
        eq(jobs.type, "export-video")
      )
    )
    .orderBy(desc(jobs.createdAt))
    .limit(1);

  if (!latestJob) {
    return NextResponse.json({
      status: "none",
      progress: 0,
      exportedVideoUrl: null,
      exportedAt: null,
    });
  }

  return NextResponse.json({
    jobId: latestJob.id,
    status: latestJob.status,
    progress: latestJob.progress,
    currentStep: latestJob.currentStep,
    errorMessage: latestJob.errorMessage,
    exportedVideoUrl: project.exportedVideoUrl,
    exportedAt: project.exportedAt,
  });
}
