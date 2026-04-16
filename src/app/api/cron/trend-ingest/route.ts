import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trendIngestionRuns } from "@/lib/db/schema";
import { getQueue } from "@/lib/queue";
import { env } from "@/lib/env";

/**
 * Phase 9 R-02 + rule 11.
 *
 * Vercel Cron → GET /api/cron/trend-ingest every 6h (see vercel.json).
 * Also accepts POST for manual testing.
 *
 * Validates x-cron-secret OR Authorization: Bearer <CRON_SECRET>.
 * Creates a trend_ingestion_runs row with source='vercel-cron', enqueues
 * the BullMQ ingest-trends job, returns 202.
 *
 * Rule 14: does NOT write to the `jobs` DB table. Cron runs are
 * tracked exclusively in trend_ingestion_runs.
 */
function validateSecret(request: NextRequest): boolean {
  const header = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = header ?? bearer;
  return typeof provided === "string" && provided === env.CRON_SECRET;
}

async function handle(request: NextRequest) {
  // Rule 11: secret validation is the FIRST thing this route does.
  if (!validateSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [run] = await db
    .insert(trendIngestionRuns)
    .values({
      regionCode: "KR",
      status: "pending",
      source: "vercel-cron",
    })
    .returning({ id: trendIngestionRuns.id });

  await getQueue().add("ingest-trends", {
    payload: {
      ingestionRunId: run.id,
      regionCode: "KR",
    },
    // No jobId — rule 14. The worker handler receives payload only.
  });

  return NextResponse.json(
    { ingestionRunId: run.id, source: "vercel-cron" },
    { status: 202 }
  );
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
