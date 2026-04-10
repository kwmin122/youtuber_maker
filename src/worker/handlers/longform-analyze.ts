import type { Job } from "bullmq";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

/**
 * Stub — real implementation lands in Plan 07-03.
 * Responsibilities (07-03): transcript extraction (youtube-transcript or
 * Gemini audio), AI candidate generation scoring hook/emotion/density/trend,
 * longform_candidates row inserts.
 */
export async function handleLongformAnalyze(
  _job: Job,
  _db: DrizzleInstance
): Promise<void> {
  throw new Error(
    "longform-analyze handler not implemented — see Plan 07-03"
  );
}
