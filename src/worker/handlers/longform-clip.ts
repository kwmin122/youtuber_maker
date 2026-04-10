import type { Job } from "bullmq";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

/**
 * Stub — real implementation lands in Plan 07-04.
 * Responsibilities (07-04): ffmpeg clip cut, 9:16 reframe,
 * child project creation, longform_candidates.childProjectId update.
 */
export async function handleLongformClip(
  _job: Job,
  _db: DrizzleInstance
): Promise<void> {
  throw new Error(
    "longform-clip handler not implemented — see Plan 07-04"
  );
}
