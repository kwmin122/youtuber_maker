import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jobs, longformSources, scenes, scripts, projects } from "@/lib/db/schema";
import { getQueue } from "@/lib/queue";
import { getLongformQueue } from "@/lib/queue-longform";
import { getServerSession } from "@/lib/auth/get-session";
import { eq, desc, and } from "drizzle-orm";

const ALLOWED_JOB_TYPES = [
  "test",
  "transcript-collect",
  "analyze-benchmark",
  "generate-script",
  "split-scenes",
  "generate-image",
  "generate-video",
  "generate-tts",
  "export-video",
  "upload-youtube",
  "generate-seo",
  "generate-thumbnail",
  "fetch-metrics",
  "generate-avatar-lipsync",
  "longform-download",
  "longform-analyze",
  "longform-clip",
] as const;

const submitJobSchema = z.object({
  type: z.enum(ALLOWED_JOB_TYPES),
  projectId: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = submitJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { type, projectId, payload } = parsed.data;

  // IDOR defense — longform-* jobs take a `sourceId` in the payload
  // and the worker handlers mutate that row. Without this check, any
  // authenticated user could enqueue `longform-download` or
  // `longform-analyze` or `longform-clip` against another user's
  // source by guessing (or scraping) its UUID. Phase 7 retry 2,
  // Codex CRITICAL-2.
  if (type.startsWith("longform-")) {
    const rawSourceId = payload?.sourceId;
    if (typeof rawSourceId !== "string" || rawSourceId.length === 0) {
      return NextResponse.json(
        { error: "longform-* jobs require payload.sourceId" },
        { status: 400 }
      );
    }
    const [sourceRow] = await db
      .select({ userId: longformSources.userId })
      .from(longformSources)
      .where(eq(longformSources.id, rawSourceId))
      .limit(1);
    if (!sourceRow) {
      return NextResponse.json(
        { error: "source not found" },
        { status: 404 }
      );
    }
    if (sourceRow.userId !== session.user.id) {
      return NextResponse.json(
        { error: "forbidden" },
        { status: 403 }
      );
    }
  }

  // IDOR defense — generate-avatar-lipsync takes payload.sceneId; without a
  // pre-check any authenticated user could enqueue avatar generation against
  // another user's scene. Phase 8 verification, H1 (same class as Codex CRITICAL-2).
  if (type === "generate-avatar-lipsync") {
    const rawSceneId = payload?.sceneId;
    if (typeof rawSceneId !== "string" || rawSceneId.length === 0) {
      return NextResponse.json(
        { error: "generate-avatar-lipsync requires payload.sceneId" },
        { status: 400 }
      );
    }
    // Ownership chain: scenes → scripts → projects → userId
    const [ownerRow] = await db
      .select({ userId: projects.userId })
      .from(scenes)
      .leftJoin(scripts, eq(scripts.id, scenes.scriptId))
      .leftJoin(projects, eq(projects.id, scripts.projectId))
      .where(eq(scenes.id, rawSceneId))
      .limit(1);
    if (!ownerRow) {
      return NextResponse.json(
        { error: "scene not found" },
        { status: 404 }
      );
    }
    if (ownerRow.userId !== session.user.id) {
      return NextResponse.json(
        { error: "forbidden" },
        { status: 403 }
      );
    }
  }

  // Insert job row with status pending
  const [created] = await db
    .insert(jobs)
    .values({
      userId: session.user.id,
      type,
      projectId: projectId || null,
      status: "pending",
      progress: 0,
      payload: payload || null,
    })
    .returning();

  // Enqueue to BullMQ — jobId/userId AFTER spread to prevent client override
  const targetQueue = type.startsWith("longform-")
    ? getLongformQueue()
    : getQueue();
  await targetQueue.add(type, {
    payload: payload || {},
    jobId: created.id,
    userId: session.user.id,
  });

  return NextResponse.json(
    { jobId: created.id, status: "pending" },
    { status: 201 }
  );
}

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  const conditions = [eq(jobs.userId, session.user.id)];
  if (projectId) {
    conditions.push(eq(jobs.projectId, projectId));
  }

  const userJobs = await db
    .select({
      id: jobs.id,
      type: jobs.type,
      status: jobs.status,
      progress: jobs.progress,
      currentStep: jobs.currentStep,
      errorMessage: jobs.errorMessage,
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .where(and(...conditions))
    .orderBy(desc(jobs.createdAt))
    .limit(50);

  return NextResponse.json(userJobs);
}
