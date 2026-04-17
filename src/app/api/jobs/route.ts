import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jobs, longformSources, scenes, scripts, projects } from "@/lib/db/schema";
import { getQueue } from "@/lib/queue";
import { getLongformQueue } from "@/lib/queue-longform";
import { getServerSession } from "@/lib/auth/get-session";
import { eq, desc, and, inArray, sql } from "drizzle-orm";

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
  "ingest-trends",              // Phase 9 — cron only, POST /api/jobs rejects explicitly (below)
  "precompute-gap-rationales",  // Phase 9 — background chained from ingest-trends
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

    // Scene-level duplicate-enqueue protection (Codex Retry-2 NEW-HIGH finding):
    // If a pending/active generate-avatar-lipsync job already exists for this
    // scene+user combination, reject the duplicate.
    //
    // Two-layer defence:
    //   1. Pre-check SELECT (below) — fast path; returns existingJobId for UX.
    //   2. DB unique partial index `jobs_avatar_dedupe_uniq` (migration 0005) —
    //      authoritative; closes the TOCTOU SELECT→INSERT race window.
    //      Postgres DOES support partial unique expression indexes on JSONB paths
    //      (contrary to the previous comment here — that comment was wrong).
    //      The INSERT try/catch for 23505 unique_violation handles race losers.
    const existingActiveJobs = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.userId, session.user.id),
          eq(jobs.type, "generate-avatar-lipsync"),
          inArray(jobs.status, ["pending", "active"]),
          sql`${jobs.payload}->>'sceneId' = ${rawSceneId}`
        )
      )
      .limit(1);

    if (existingActiveJobs.length > 0) {
      return NextResponse.json(
        { error: "already_enqueued", existingJobId: existingActiveJobs[0].id },
        { status: 409 }
      );
    }
  }

  // Phase 9 rule 14: `ingest-trends` is cron-only. It is bypassed from the
  // jobs DB table entirely and enqueued directly into BullMQ by the cron
  // route at `/api/cron/trend-ingest`. Any attempt to POST /api/jobs with
  // this type is a bug or an attack — reject.
  if (type === "ingest-trends") {
    return NextResponse.json(
      { error: "ingest-trends is cron-only; use /api/cron/trend-ingest" },
      { status: 403 }
    );
  }

  // Phase 9: `precompute-gap-rationales` must target the caller's own
  // userId. Admin allowlist bypass available for ops.
  if (type === "precompute-gap-rationales") {
    const rawUserId = payload?.userId;
    if (typeof rawUserId !== "string" || rawUserId.length === 0) {
      return NextResponse.json(
        { error: "precompute-gap-rationales requires payload.userId" },
        { status: 400 }
      );
    }
    const adminAllowlist = (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const isAdmin = adminAllowlist.includes(session.user.id);
    if (!isAdmin && rawUserId !== session.user.id) {
      return NextResponse.json(
        { error: "forbidden" },
        { status: 403 }
      );
    }
  }

  // Insert job row with status pending.
  // Wrapped in try/catch to handle 23505 unique_violation from the
  // `jobs_avatar_dedupe_uniq` partial index (migration 0005). This closes the
  // TOCTOU race where two concurrent POSTs both pass the SELECT pre-check above
  // and then race to INSERT — the loser hits the constraint and gets a 409.
  // Only 23505 on the specific constraint is caught; all other errors propagate
  // as 500 so DB/network issues are not silently swallowed.
  let created: { id: string };
  try {
    const rows = await db
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
    created = rows[0];
  } catch (err) {
    const pgErr = err as { code?: string; constraint_name?: string; constraint?: string };
    const isUniqueViolation = pgErr.code === "23505";
    const constraintName = pgErr.constraint_name ?? pgErr.constraint;
    if (isUniqueViolation && constraintName === "jobs_avatar_dedupe_uniq") {
      // Race loser: another concurrent INSERT already won the constraint race.
      return NextResponse.json(
        { error: "already_enqueued" },
        { status: 409 }
      );
    }
    // All other DB errors (connection failure, FK violation, etc.) propagate.
    throw err;
  }

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
