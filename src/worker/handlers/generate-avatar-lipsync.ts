import type { Job } from "bullmq";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

export async function handleGenerateAvatarLipsync(
  _job: Job,
  _db: DrizzleInstance
): Promise<void> {
  throw new Error(
    "generate-avatar-lipsync handler not implemented — see Plan 08-04"
  );
}
