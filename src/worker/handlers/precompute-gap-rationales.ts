import type { Job } from "bullmq";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

/**
 * Phase 9 — stub placeholder. Full implementation lands in plan 09-02.
 */
export async function handlePrecomputeGapRationales(
  _job: Job,
  _db: DrizzleInstance
): Promise<void> {
  throw new Error(
    "handlePrecomputeGapRationales not implemented — see .planning/phases/09-trend-intelligence/09-02-PLAN.md"
  );
}
