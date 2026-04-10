import { NextRequest, NextResponse } from "next/server";
import { and, eq, asc, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  longformSources,
  longformCandidates,
  jobs,
} from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";

/**
 * GET /api/longform/sources/[id]
 *
 * Returns a single longform source (owned by the current user) along
 * with its candidate clips (Plan 07-03) and the most recent
 * `longform-download` job for UI polling.
 *
 * Response shape:
 *   {
 *     source: LongformSourceRow,
 *     candidates: LongformCandidateRow[],
 *     latestJob: { id, type, status, progress, currentStep, errorMessage, updatedAt } | null
 *   }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [source] = await db
    .select()
    .from(longformSources)
    .where(
      and(
        eq(longformSources.id, id),
        eq(longformSources.userId, session.user.id)
      )
    );

  if (!source) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const candidates = await db
    .select()
    .from(longformCandidates)
    .where(eq(longformCandidates.sourceId, id))
    .orderBy(asc(longformCandidates.startMs));

  // Latest longform-download job whose payload references this source.
  // Uses a JSONB operator because `jobs.payload` is a jsonb column.
  const [latestJob] = await db
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
    .where(
      and(
        eq(jobs.userId, session.user.id),
        eq(jobs.type, "longform-download"),
        sql`${jobs.payload}->>'sourceId' = ${id}`
      )
    )
    .orderBy(desc(jobs.createdAt))
    .limit(1);

  return NextResponse.json({
    source,
    candidates,
    latestJob: latestJob ?? null,
  });
}
