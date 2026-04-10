import type { Job } from "bullmq";
import { eq, inArray, and } from "drizzle-orm";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  jobs,
  jobEvents,
  longformSources,
  longformCandidates,
} from "@/lib/db/schema";
import {
  downloadLongformSourceToPath,
  uploadLongformClipFromPath,
} from "@/lib/media/longform-storage";
import { clipLongform9x16 } from "@/lib/video/clip-longform";
import { assertDiskSpaceAvailable } from "@/lib/video/disk-preflight";
import { createChildProjectForClip } from "@/lib/longform/create-child-project";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

type LongformClipPayload = {
  sourceId: string;
  candidateIds: string[];
};

type LongformClipJobData = {
  jobId: string;
  userId: string;
  payload: LongformClipPayload;
};

export type LongformClipResult = {
  sourceId: string;
  childProjectIds: string[];
  count: number;
};

// Rough heuristic: 500 KB/s (~4 Mbps) * duration * 2x working copy.
const DISK_BYTES_PER_SECOND = 500_000;
const DISK_WORKING_MULTIPLIER = 2;
const DEFAULT_DURATION_SECONDS_FOR_ESTIMATE = 600;

/**
 * Worker handler for the `longform-clip` job.
 *
 * Downloads the longform source ONCE into a tempdir, then loops over
 * each requested candidate, spawning FFmpeg to clip a 1080x1920 30fps
 * mp4, uploading the clip to Supabase Storage, and creating a full
 * child project (projects + scripts + scenes + media_assets) via
 * `createChildProjectForClip`.
 *
 * Cleanup: a `finally` block removes the entire tempdir regardless of
 * success or failure. Per-iteration cleanup also removes each clip
 * file once uploaded, to keep disk usage bounded for large batches.
 */
export async function handleLongformClip(
  job: Job,
  db: DrizzleInstance
): Promise<LongformClipResult> {
  const { jobId, userId, payload } = job.data as LongformClipJobData;

  if (!jobId || !userId) {
    throw new Error("longform-clip: jobId and userId are required");
  }
  if (!payload?.sourceId) {
    throw new Error("longform-clip: sourceId is required in payload");
  }
  if (!Array.isArray(payload.candidateIds) || payload.candidateIds.length === 0) {
    throw new Error(
      "longform-clip: candidateIds must be a non-empty array"
    );
  }

  const { sourceId, candidateIds } = payload;
  let tempDir: string | null = null;

  try {
    await db
      .update(jobs)
      .set({
        status: "active",
        currentStep: "loading source",
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
    await db.insert(jobEvents).values({
      jobId,
      event: "started",
      data: { sourceId, count: candidateIds.length },
    });
    if (typeof job.updateProgress === "function") {
      await job.updateProgress(2);
    }

    // --- Load source ---
    const sourceRows = await db
      .select()
      .from(longformSources)
      .where(eq(longformSources.id, sourceId));
    const source = sourceRows[0];
    if (!source) {
      throw new Error(`longform source ${sourceId} not found`);
    }
    // Analyze handler leaves sources at status='ready'. Accept both
    // 'ready' and 'analyzed' (forward-compat) before clipping.
    if (source.status !== "ready" && source.status !== "analyzed") {
      throw new Error(
        `longform source not ready for clipping (status=${source.status})`
      );
    }
    if (!source.storagePath) {
      throw new Error(
        `longform source ${sourceId} has no storagePath`
      );
    }
    if (source.userId !== userId) {
      throw new Error(
        `longform source ${sourceId} does not belong to user ${userId}`
      );
    }

    // --- Load candidates ---
    const candidates = await db
      .select()
      .from(longformCandidates)
      .where(
        and(
          eq(longformCandidates.sourceId, sourceId),
          inArray(longformCandidates.id, candidateIds)
        )
      );
    if (candidates.length !== candidateIds.length) {
      throw new Error(
        `longform-clip: expected ${candidateIds.length} candidates, found ${candidates.length}`
      );
    }

    // --- Disk preflight ---
    const durationForEstimate =
      source.durationSeconds ?? DEFAULT_DURATION_SECONDS_FOR_ESTIMATE;
    const estimatedBytes =
      durationForEstimate * DISK_BYTES_PER_SECOND * DISK_WORKING_MULTIPLIER;
    await assertDiskSpaceAvailable(estimatedBytes);

    // Flip source row to 'clipping' so the detail UI's progress
    // banner renders during a long batch clip. Falls back to 'ready'
    // in both the success and failure paths below.
    await db
      .update(longformSources)
      .set({ status: "clipping", updatedAt: new Date() })
      .where(eq(longformSources.id, sourceId));

    // --- Download source once ---
    tempDir = await mkdtemp(join(tmpdir(), "longform-clip-"));
    const sourcePath = join(tempDir, "source.mp4");

    await db
      .update(jobs)
      .set({
        currentStep: "downloading source",
        progress: 5,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
    if (typeof job.updateProgress === "function") {
      await job.updateProgress(5);
    }

    // Stream the source bytes to disk without ever holding them in
    // RAM. Prevents Railway worker OOM on 2 GB longform inputs.
    await downloadLongformSourceToPath({
      storagePath: source.storagePath,
      destPath: sourcePath,
    });

    // --- Clip loop ---
    const childProjectIds: string[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const outputPath = join(tempDir, `clip-${cand.id}.mp4`);
      const progressBase =
        10 + Math.round((80 * i) / candidates.length);

      await db
        .update(jobs)
        .set({
          currentStep: `clipping ${i + 1}/${candidates.length}`,
          progress: progressBase,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));
      if (typeof job.updateProgress === "function") {
        await job.updateProgress(progressBase);
      }

      await clipLongform9x16({
        inputPath: sourcePath,
        outputPath,
        startMs: cand.startMs,
        endMs: cand.endMs,
      });

      // Stream the clip mp4 directly to Supabase Storage without
      // buffering it in RAM — clips are bounded to 60s so the memory
      // win is smaller, but it also means we never have two copies
      // (disk + buffer) of the file live at once.
      const { storagePath: clipStoragePath, publicUrl: clipPublicUrl } =
        await uploadLongformClipFromPath({
          userId,
          candidateId: cand.id,
          filePath: outputPath,
        });

      const { projectId } = await createChildProjectForClip({
        userId,
        source,
        candidate: cand,
        clipPublicUrl,
        clipStoragePath,
      });
      childProjectIds.push(projectId);

      await db.insert(jobEvents).values({
        jobId,
        event: "progress",
        data: {
          candidateId: cand.id,
          projectId,
          done: i + 1,
          total: candidates.length,
        },
      });

      // Per-iteration cleanup to keep disk bounded across large batches.
      try {
        await rm(outputPath, { force: true });
      } catch {
        // Ignore — best-effort cleanup.
      }
    }

    // --- Success ---
    // Flip source back to 'ready' so the UI leaves the clipping
    // progress state and the candidate grid is interactive again.
    await db
      .update(longformSources)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(longformSources.id, sourceId));

    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: 100,
        currentStep: "clipping complete",
        result: {
          sourceId,
          childProjectIds,
          count: childProjectIds.length,
        },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: { childProjectIds, count: childProjectIds.length },
    });
    if (typeof job.updateProgress === "function") {
      await job.updateProgress(100);
    }

    return { sourceId, childProjectIds, count: childProjectIds.length };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    try {
      // Release the source back to 'ready' on failure so the user
      // can retry. (We never leave it stuck in 'clipping'.)
      await db
        .update(longformSources)
        .set({ status: "ready", updatedAt: new Date() })
        .where(eq(longformSources.id, sourceId));
      await db
        .update(jobs)
        .set({
          status: "failed",
          errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));
      await db.insert(jobEvents).values({
        jobId,
        event: "failed",
        data: { error: errorMessage },
      });
    } catch {
      // Ignore — we are already throwing the original error.
    }
    throw error;
  } finally {
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors so the real error (if any) propagates.
      }
    }
  }
}
