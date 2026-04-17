import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trendIngestionRuns } from "@/lib/db/schema";
import { getQueue } from "@/lib/queue";
import { getServerSession } from "@/lib/auth/get-session";
import { tryAcquireRefreshToken } from "@/lib/trends/rate-limit";

/**
 * Phase 9 R-08 — manual refresh button on /trends dashboard.
 * Session-gated, rate-limited 1/min/user (rule 16). Enqueues the same
 * ingest-trends BullMQ job as the cron route, with source='manual-admin'.
 *
 * Rule 14: no `jobs` DB row.
 */
export async function POST() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gate = tryAcquireRefreshToken(session.user.id);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: gate.retryAfterMs },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) },
      }
    );
  }

  const [run] = await db
    .insert(trendIngestionRuns)
    .values({
      regionCode: "KR",
      status: "pending",
      source: "manual-admin",
    })
    .returning({ id: trendIngestionRuns.id });

  await getQueue().add("ingest-trends", {
    payload: {
      ingestionRunId: run.id,
      regionCode: "KR",
    },
  });

  return NextResponse.json(
    { ingestionRunId: run.id, source: "manual-admin" },
    { status: 202 }
  );
}
