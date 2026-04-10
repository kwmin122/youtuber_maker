import type { Job } from "bullmq";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

/**
 * Stub — real implementation lands in Plan 07-02.
 * Responsibilities (07-02): yt-dlp download, Supabase Storage upload,
 * ffprobe duration extraction, longform_sources row updates.
 */
export async function handleLongformDownload(
  _job: Job,
  _db: DrizzleInstance
): Promise<void> {
  throw new Error(
    "longform-download handler not implemented — see Plan 07-02"
  );
}
