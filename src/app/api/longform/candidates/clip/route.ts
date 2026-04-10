import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, longformCandidates, longformSources } from "@/lib/db/schema";
import { getLongformQueue } from "@/lib/queue-longform";
import { getServerSession } from "@/lib/auth/get-session";

/**
 * POST /api/longform/candidates/clip
 *
 * Enqueue a `longform-clip` job that will FFmpeg-clip selected
 * candidates from a ready longform source and create a child project
 * per clip. Supports two modes:
 *
 *   { mode: 'selected', sourceId, candidateIds: [uuid, ...] }
 *   { mode: 'all', sourceId }
 *
 * Auth: required. The source row must belong to the authenticated
 * user, otherwise a 404 is returned (not 403, to avoid leaking
 * existence).
 */
const bodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("selected"),
    sourceId: z.string().uuid(),
    candidateIds: z.array(z.string().uuid()).min(1),
  }),
  z.object({
    mode: z.literal("all"),
    sourceId: z.string().uuid(),
  }),
]);

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const body = parsed.data;

  // Ownership check via compound WHERE.
  const [source] = await db
    .select()
    .from(longformSources)
    .where(
      and(
        eq(longformSources.id, body.sourceId),
        eq(longformSources.userId, session.user.id)
      )
    );
  if (!source) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (source.status !== "ready" && source.status !== "analyzed") {
    return NextResponse.json(
      { error: `source not ready (status=${source.status})` },
      { status: 409 }
    );
  }

  // Resolve candidateIds.
  let candidateIds: string[];
  if (body.mode === "all") {
    const rows = await db
      .select({ id: longformCandidates.id })
      .from(longformCandidates)
      .where(eq(longformCandidates.sourceId, body.sourceId));
    candidateIds = rows.map((r) => r.id);
  } else {
    // Re-fetch to ensure all the provided candidate ids belong to the
    // source (defense-in-depth; the worker re-validates too).
    const rows = await db
      .select({ id: longformCandidates.id })
      .from(longformCandidates)
      .where(eq(longformCandidates.sourceId, body.sourceId));
    const owned = new Set(rows.map((r) => r.id));
    const filtered = body.candidateIds.filter((id) => owned.has(id));
    if (filtered.length !== body.candidateIds.length) {
      return NextResponse.json(
        { error: "one or more candidateIds do not belong to the source" },
        { status: 400 }
      );
    }
    candidateIds = filtered;
  }

  if (candidateIds.length === 0) {
    return NextResponse.json(
      { error: "no candidates to clip" },
      { status: 400 }
    );
  }

  const [jobRow] = await db
    .insert(jobs)
    .values({
      userId: session.user.id,
      type: "longform-clip",
      status: "pending",
      progress: 0,
      payload: { sourceId: body.sourceId, candidateIds },
    })
    .returning();

  await getLongformQueue().add("longform-clip", {
    jobId: jobRow.id,
    userId: session.user.id,
    payload: { sourceId: body.sourceId, candidateIds },
  });

  return NextResponse.json(
    { jobId: jobRow.id, count: candidateIds.length },
    { status: 201 }
  );
}
