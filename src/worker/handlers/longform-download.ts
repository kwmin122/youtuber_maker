import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";
import { jobs, jobEvents, longformSources } from "@/lib/db/schema";
import { probeVideoMetadata, downloadVideo } from "@/lib/video/ytdlp";
import {
  assertDurationInBounds,
} from "@/lib/video/longform-constants";
import {
  uploadLongformSourceFromPath,
  downloadLongformSourceToPath,
  getLongformPublicUrl,
  deleteLongformSource,
} from "@/lib/media/longform-storage";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

type LongformDownloadPayload = {
  sourceId: string;
};

/**
 * Worker handler for the `longform-download` job.
 *
 * Two paths depending on `longform_sources.sourceType`:
 *
 * - `url`:  probe the URL with yt-dlp, enforce duration bounds,
 *            download to a tempdir at 720p, upload to
 *            `longform-sources/<userId>/<sourceId>/source.mp4`.
 *
 * - `file`: the client already wrote the bytes to Supabase Storage
 *            via a signed upload URL. Download them back into a
 *            tempdir, probe duration with ffprobe, enforce bounds,
 *            and mark the row as ready (no re-upload required).
 *
 * On success: `longform_sources.status='ready'` with durationSeconds,
 * title, storagePath, publicUrl, and metadata populated.
 *
 * On failure: both `jobs.status='failed'` and
 * `longform_sources.status='failed'` are updated with errorMessage,
 * and the error is re-thrown so BullMQ records the failure.
 */
export async function handleLongformDownload(
  job: Job,
  db: DrizzleInstance
): Promise<{ sourceId: string; durationSeconds: number; title: string }> {
  const { jobId, userId, payload } = job.data as {
    jobId: string;
    userId: string;
    payload: LongformDownloadPayload;
  };

  if (!jobId || !userId || !payload?.sourceId) {
    throw new Error(
      "longform-download requires jobId, userId, and payload.sourceId"
    );
  }
  const { sourceId } = payload;

  let tempDir: string | null = null;
  // Track the storage path we just uploaded so the catch block can
  // delete it if a later DB update fails. Prevents orphan objects in
  // the longform-sources bucket when a worker crashes mid-job.
  let uploadedPath: string | null = null;
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
      data: { sourceId },
    });

    const [source] = await db
      .select()
      .from(longformSources)
      .where(eq(longformSources.id, sourceId));

    if (!source) {
      throw new Error(`longform_source ${sourceId} not found`);
    }
    // Defense in depth — the /api/jobs route already rejects cross-user
    // longform enqueues, but the handler must also refuse to act on a
    // source it does not own. Phase 7 retry 2, Codex CRITICAL-2.
    if (source.userId !== userId) {
      throw new Error(
        `longform source ${sourceId} does not belong to user ${userId}`
      );
    }

    await db
      .update(longformSources)
      .set({ status: "downloading", updatedAt: new Date() })
      .where(eq(longformSources.id, sourceId));

    tempDir = await mkdtemp(join(tmpdir(), "longform-dl-"));
    const finalPath = join(tempDir, "source.mp4");

    let durationSeconds: number;
    let title: string;
    let metadata: Record<string, unknown> = {};
    let storagePath: string | null = source.storagePath ?? null;
    let publicUrl: string | null = source.publicUrl ?? null;

    if (source.sourceType === "url") {
      if (!source.sourceUrl) {
        throw new Error("URL source missing sourceUrl");
      }

      await db
        .update(jobs)
        .set({
          currentStep: "probing video",
          progress: 5,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      const meta = await probeVideoMetadata(source.sourceUrl);
      assertDurationInBounds(meta.durationSeconds);
      title = meta.title || source.title || "Untitled video";
      durationSeconds = meta.durationSeconds;
      metadata = {
        ytdlpId: meta.id,
        webpageUrl: meta.webpageUrl,
        ext: meta.ext,
        filesizeApprox: meta.filesizeApprox,
      };

      await db
        .update(jobs)
        .set({
          currentStep: "downloading video",
          progress: 10,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      await downloadVideo(source.sourceUrl, finalPath, async (pct) => {
        // Map 0-100 download → 10-70 job progress window.
        const scaled = 10 + Math.round(pct * 0.6);
        try {
          await db
            .update(jobs)
            .set({ progress: scaled, updatedAt: new Date() })
            .where(eq(jobs.id, jobId));
          await db.insert(jobEvents).values({
            jobId,
            event: "progress",
            data: { phase: "download", percent: pct },
          });
        } catch {
          /* swallow: progress is best-effort */
        }
      });

      // Upload the downloaded file to Supabase Storage
      await db
        .update(jobs)
        .set({
          currentStep: "uploading to storage",
          progress: 75,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      // Stream the downloaded file straight into Supabase Storage
      // without ever materializing its bytes in RAM. Fixes the
      // Railway worker OOM on 2 GB sources.
      const uploaded = await uploadLongformSourceFromPath({
        userId,
        sourceId,
        filePath: finalPath,
      });
      storagePath = uploaded.storagePath;
      publicUrl = uploaded.publicUrl;
      uploadedPath = storagePath;
    } else if (source.sourceType === "file") {
      if (!source.storagePath) {
        throw new Error("file source missing storagePath");
      }

      await db
        .update(jobs)
        .set({
          currentStep: "downloading uploaded file",
          progress: 10,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      // Stream the file directly into tempDir so we can ffprobe it
      // without copying the bytes through a Buffer.
      await downloadLongformSourceToPath({
        storagePath: source.storagePath,
        destPath: finalPath,
      });

      await db
        .update(jobs)
        .set({
          currentStep: "probing duration",
          progress: 50,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      const probe = await probeDurationWithFfprobe(finalPath);
      assertDurationInBounds(probe.duration);
      durationSeconds = probe.duration;
      title =
        probe.title ??
        source.title ??
        source.storagePath.split("/").pop() ??
        "Uploaded video";
      metadata = { probedViaFfprobe: true };

      // File is already in storage — just resolve the public URL.
      if (!publicUrl) {
        publicUrl = getLongformPublicUrl(source.storagePath);
      }
      storagePath = source.storagePath;
    } else {
      throw new Error(`Unknown sourceType: ${String(source.sourceType)}`);
    }

    await db
      .update(longformSources)
      .set({
        status: "ready",
        storagePath,
        publicUrl,
        title,
        durationSeconds,
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(longformSources.id, sourceId));

    // Row now owns the storage object — clear the orphan-cleanup
    // tracker so a later failure doesn't delete a live reference.
    uploadedPath = null;

    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: 100,
        currentStep: "download complete",
        result: { sourceId, durationSeconds, title },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: { sourceId, durationSeconds, title },
    });

    return { sourceId, durationSeconds, title };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    // Best-effort orphan storage cleanup: if we uploaded to storage
    // but the run failed before the `longform_sources` row reached
    // `ready`, delete the dangling object so we do not leak bytes.
    if (uploadedPath) {
      try {
        await deleteLongformSource(uploadedPath);
      } catch {
        /* swallow: cleanup is best-effort */
      }
    }

    try {
      await db
        .update(jobs)
        .set({
          status: "failed",
          errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      await db
        .update(longformSources)
        .set({
          status: "failed",
          errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(longformSources.id, payload.sourceId));

      await db.insert(jobEvents).values({
        jobId,
        event: "failed",
        data: { error: errorMessage },
      });
    } catch {
      /* swallow: don't mask original error */
    }

    throw error;
  } finally {
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        /* swallow: cleanup is best-effort */
      }
    }
  }
}

/**
 * Probe a local file's duration with `ffprobe`. Returns seconds
 * (rounded) and any embedded title tag if available. ffprobe ships
 * with ffmpeg, which is already installed in the Railway worker
 * image by the Phase 7 Dockerfile updates.
 */
async function probeDurationWithFfprobe(
  filePath: string
): Promise<{ duration: number; title?: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration:format_tags=title",
      "-of",
      "json",
      filePath,
    ]);

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`ffprobe failed (${code}): ${stderr.slice(0, 500)}`)
        );
      }
      try {
        const json = JSON.parse(stdout);
        const rawDuration = parseFloat(json?.format?.duration ?? "0");
        resolve({
          duration: Math.round(rawDuration),
          title: json?.format?.tags?.title,
        });
      } catch (err) {
        reject(
          new Error(
            `ffprobe JSON parse failed: ${(err as Error).message}`
          )
        );
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`ffprobe spawn failed: ${err.message}`));
    });
  });
}
