import type { Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";
import { createWriteStream, createReadStream } from "fs";
import { stat } from "fs/promises";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import {
  jobs,
  jobEvents,
  scenes,
  scripts,
  projects,
  mediaAssets,
  avatarPresets,
} from "@/lib/db/schema";
import { getUserAvatarProvider } from "@/lib/avatar/provider-factory";
import { convertToWav16kMono } from "@/lib/video/audio-convert";
import { uploadAvatarVideoFromPath } from "@/lib/media/avatar-video-storage";
import { getServiceRoleClient } from "@/lib/supabase";
import type { AvatarLipsyncSubmitRequest } from "@/lib/avatar/provider";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

type Payload = {
  sceneId: string;
  /** Optional override — usually taken from scenes.avatarPresetId. */
  avatarPresetId?: string;
};

type JobData = {
  jobId: string;
  userId: string;
  payload: Payload;
};

export async function handleGenerateAvatarLipsync(
  job: Job,
  db: DrizzleInstance
): Promise<{ sceneId: string; avatarVideoUrl: string; skipped: boolean }> {
  const { jobId, userId, payload } = job.data as JobData;
  if (!jobId || !userId) throw new Error("jobId/userId required");
  if (!payload?.sceneId) throw new Error("payload.sceneId required");

  let tempDir: string | null = null;

  try {
    // ---- CAS: pending → active (PLANS.md rule 1: use .returning().length) ----
    const casRows = await db
      .update(jobs)
      .set({ status: "active", currentStep: "loading scene", updatedAt: new Date() })
      .where(and(eq(jobs.id, jobId), eq(jobs.status, "pending")))
      .returning({ id: jobs.id });
    if (casRows.length === 0) {
      // Someone else already picked this up (or it was cancelled).
      // Return skipped cleanly — BullMQ will remove the job on success return.
      return { sceneId: payload.sceneId, avatarVideoUrl: "", skipped: true };
    }
    await db.insert(jobEvents).values({ jobId, event: "started", data: { sceneId: payload.sceneId } });
    if (typeof job.updateProgress === "function") await job.updateProgress(3);

    // ---- Ownership check (PLANS.md rule 4) ----
    // Scene -> script -> project -> userId. Defense-in-depth against
    // IDOR; a client could enqueue with someone else's sceneId.
    const [sceneRow] = await db
      .select({
        id: scenes.id,
        scriptId: scenes.scriptId,
        duration: scenes.duration,
        avatarPresetId: scenes.avatarPresetId,
        avatarVideoUrl: scenes.avatarVideoUrl,
        avatarProviderTaskId: scenes.avatarProviderTaskId,
      })
      .from(scenes)
      .where(eq(scenes.id, payload.sceneId))
      .limit(1);
    if (!sceneRow) throw new Error(`scene not found: ${payload.sceneId}`);

    if (sceneRow.scriptId) {
      const [scriptRow] = await db
        .select({ projectId: scripts.projectId })
        .from(scripts)
        .where(eq(scripts.id, sceneRow.scriptId))
        .limit(1);
      if (!scriptRow) throw new Error("script not found for scene");
      const [projectRow] = await db
        .select({ userId: projects.userId })
        .from(projects)
        .where(eq(projects.id, scriptRow.projectId))
        .limit(1);
      if (!projectRow) throw new Error("project not found for script");
      if (projectRow.userId !== userId) {
        throw new Error(`ownership mismatch: scene ${payload.sceneId} not owned by user ${userId}`);
      }
    }

    // ---- Idempotency gate BEFORE provider submit (PLANS.md rule 7) ----
    // If a previous attempt already wrote avatarVideoUrl for this scene
    // with a matching provider task id, we've already spent the external
    // cost — return the existing URL without calling the provider again.
    if (sceneRow.avatarVideoUrl && sceneRow.avatarProviderTaskId) {
      await db
        .update(jobs)
        .set({ status: "completed", progress: 100, updatedAt: new Date() })
        .where(eq(jobs.id, jobId));
      return {
        sceneId: payload.sceneId,
        avatarVideoUrl: sceneRow.avatarVideoUrl,
        skipped: true,
      };
    }

    // ---- TTS guard: audio media_assets row must exist and be completed ----
    const [audioAsset] = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.sceneId, payload.sceneId), eq(mediaAssets.type, "audio")))
      .limit(1);
    if (!audioAsset || audioAsset.status !== "completed") {
      throw new Error(
        `TTS audio not ready for scene ${payload.sceneId}; avatar job aborted`
      );
    }

    // Resolve avatar preset (for avatarId or referenceImageUrl)
    const presetId = payload.avatarPresetId ?? sceneRow.avatarPresetId;
    if (!presetId) throw new Error("avatarPresetId missing on scene and payload");
    const [presetRow] = await db
      .select()
      .from(avatarPresets)
      .where(eq(avatarPresets.id, presetId))
      .limit(1);
    if (!presetRow) throw new Error(`avatar preset not found: ${presetId}`);

    // ---- Prepare workspace ----
    tempDir = await mkdtemp(join(tmpdir(), `avatar-${payload.sceneId}-`));
    const inputAudioPath = join(tempDir, "input.mp3");
    const wavAudioPath = join(tempDir, "audio.wav");
    const outputVideoPath = join(tempDir, "avatar.mp4");

    // Fetch TTS audio → local file
    const audioRes = await fetch(audioAsset.url);
    if (!audioRes.ok) throw new Error(`failed to fetch audio: ${audioRes.status}`);
    await writeFile(inputAudioPath, Buffer.from(await audioRes.arrayBuffer()));

    // MP3 → WAV 16kHz mono (D-10; required for HeyGen, standardized for D-ID too)
    await convertToWav16kMono(inputAudioPath, wavAudioPath);
    if (typeof job.updateProgress === "function") await job.updateProgress(20);

    // Stage WAV in generated-media bucket so the provider can fetch via URL.
    // NOTE: the avatar-references bucket rejects audio MIME types (image whitelist only),
    // so we stage under generated-media with an idempotent path.
    const wavStagingPath = `${userId}/${payload.sceneId}/tts-for-avatar.wav`;
    const wavPublicUrl = await (async () => {
      const client = getServiceRoleClient();
      const { data: signed, error } = await client.storage
        .from("generated-media")
        .createSignedUploadUrl(wavStagingPath, { upsert: true });
      if (error || !signed) throw new Error(`wav staging signed url failed: ${error?.message}`);

      const wavStats = await stat(wavAudioPath);
      const put = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: {
          "content-type": "audio/wav",
          "content-length": String(wavStats.size),
          "x-upsert": "true",
        },
        body: createReadStream(wavAudioPath) as unknown as BodyInit,
        duplex: "half",
      } as RequestInit & { duplex: "half" });
      if (!put.ok) throw new Error(`wav staging PUT failed: ${put.status}`);

      const { data: pub } = client.storage.from("generated-media").getPublicUrl(wavStagingPath);
      return pub.publicUrl;
    })();

    if (typeof job.updateProgress === "function") await job.updateProgress(30);

    // ---- Provider submit + poll, with automatic fallback (D-01) ----
    const submitReq: AvatarLipsyncSubmitRequest = {
      audioUrl: wavPublicUrl,
      width: 1080,
      height: 1920,
    };
    if (presetRow.provider === "heygen") {
      submitReq.avatarId = presetRow.providerAvatarId;
    } else {
      submitReq.referenceImageUrl = presetRow.previewImageUrl ?? undefined;
    }

    let providerTaskId: string | null = null;
    let resultVideoUrl: string | null = null;
    let usedProviderName: "heygen" | "did" | null = null;

    async function tryProvider(
      preferred: "heygen" | "did"
    ): Promise<{ taskId: string; videoUrl: string } | null> {
      const resolved = await getUserAvatarProvider(userId, preferred).catch((e) => {
        console.warn(`[generate-avatar-lipsync] no ${preferred} key: ${(e as Error).message}`);
        return null;
      });
      if (!resolved || resolved.providerName !== preferred) return null;

      const req: AvatarLipsyncSubmitRequest = { ...submitReq };
      // Normalize the request shape per provider when falling back across providers.
      if (preferred === "did") {
        req.referenceImageUrl = presetRow.previewImageUrl ?? undefined;
        req.avatarId = undefined;
      } else {
        req.avatarId = presetRow.provider === "heygen" ? presetRow.providerAvatarId : undefined;
        req.referenceImageUrl = req.avatarId ? undefined : (presetRow.previewImageUrl ?? undefined);
      }

      // C3 fix: wrap the submit+poll block in try/catch so that a thrown
      // exception from generateLipsyncJob (e.g. HeyGen 429 / 5xx / network
      // error) returns null instead of escaping and bypassing the D-ID fallback.
      try {
        const taskId = await resolved.provider.generateLipsyncJob(req);
        const task = await resolved.provider.waitForCompletion(taskId, {
          maxAttempts: 60,
          intervalMs: 5_000,
        });
        if (task.status === "completed" && task.videoUrl) {
          return { taskId, videoUrl: task.videoUrl };
        }
        console.warn(
          `[generate-avatar-lipsync] ${preferred} task failed: ${task.errorMessage ?? "no video url"}`
        );
        return null;
      } catch (err) {
        console.error(
          `[generate-avatar-lipsync] ${preferred} threw during submit/wait: ${(err as Error).message}`
        );
        return null;
      }
    }

    const primary = await tryProvider("heygen");
    if (primary) {
      providerTaskId = primary.taskId;
      resultVideoUrl = primary.videoUrl;
      usedProviderName = "heygen";
    } else {
      const fallback = await tryProvider("did");
      if (fallback) {
        providerTaskId = fallback.taskId;
        resultVideoUrl = fallback.videoUrl;
        usedProviderName = "did";
      }
    }

    if (!providerTaskId || !resultVideoUrl) {
      throw new Error("all avatar providers failed (HeyGen + D-ID)");
    }

    if (typeof job.updateProgress === "function") await job.updateProgress(70);

    // ---- Streaming download of provider result (PLANS.md rule 5) ----
    const dlRes = await fetch(resultVideoUrl);
    if (!dlRes.ok || !dlRes.body) {
      throw new Error(`provider result download failed: ${dlRes.status}`);
    }
    await pipeline(
      Readable.fromWeb(dlRes.body as unknown as import("stream/web").ReadableStream),
      createWriteStream(outputVideoPath)
    );

    if (typeof job.updateProgress === "function") await job.updateProgress(80);

    // ---- Streaming upload to Supabase (PLANS.md rules 2, 5, 6) ----
    const uploaded = await uploadAvatarVideoFromPath({
      userId,
      sceneId: payload.sceneId,
      localPath: outputVideoPath,
    });

    // ---- ffprobe re-sync duration (D-09) ----
    const actualDuration = await probeDurationSeconds(outputVideoPath);

    // ---- Orphan cleanup: delete previous avatar video from storage (D-12 / C2 fix) ----
    // The scene row still holds the OLD avatarVideoUrl before this update runs.
    // If the user regenerated with a different preset, we clean up the previous file
    // from the avatar-videos bucket to avoid storage leaks.
    if (sceneRow.avatarVideoUrl) {
      try {
        // Extract storage path from the public URL.
        // Format: https://<project>.supabase.co/storage/v1/object/public/avatar-videos/<path>
        const oldUrl = sceneRow.avatarVideoUrl;
        const bucketMarker = "/avatar-videos/";
        const markerIdx = oldUrl.indexOf(bucketMarker);
        if (markerIdx !== -1) {
          const oldPath = oldUrl.slice(markerIdx + bucketMarker.length);
          await getServiceRoleClient().storage.from("avatar-videos").remove([oldPath]);
        }
      } catch (cleanupErr) {
        console.error(
          `[generate-avatar-lipsync] failed to delete old avatar storage object: ${(cleanupErr as Error).message}`
        );
        // Don't fail the job — cleanup failure is non-fatal
      }
    }

    // ---- Persist to scene row ----
    await db
      .update(scenes)
      .set({
        avatarVideoUrl: uploaded.publicUrl,
        avatarProviderTaskId: providerTaskId,
        duration: actualDuration,
        updatedAt: new Date(),
      })
      .where(eq(scenes.id, payload.sceneId));

    // ---- Complete job row ----
    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: 100,
        currentStep: "done",
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: {
        sceneId: payload.sceneId,
        provider: usedProviderName,
        providerTaskId,
        avatarVideoUrl: uploaded.publicUrl,
      },
    });

    if (typeof job.updateProgress === "function") await job.updateProgress(100);

    // Best-effort: delete the WAV staging object to avoid storage leak
    try {
      await getServiceRoleClient().storage.from("generated-media").remove([wavStagingPath]);
    } catch {
      /* ignore — idempotent path will be overwritten on retry anyway */
    }

    return {
      sceneId: payload.sceneId,
      avatarVideoUrl: uploaded.publicUrl,
      skipped: false,
    };
  } catch (err) {
    // PLANS.md rule 10: mark job as failed + insert job_events row
    const message = err instanceof Error ? err.message : String(err);
    try {
      await db
        .update(jobs)
        .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
        .where(eq(jobs.id, jobId));
      await db.insert(jobEvents).values({
        jobId,
        event: "failed",
        data: { error: message },
      });
    } catch {
      /* if DB write fails too, just let the original error propagate */
    }
    throw err;
  } finally {
    // PLANS.md rule 10: always clean up tempdir
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Run ffprobe on a local file and return the duration in seconds.
 * Used to re-sync scenes.duration to the actual avatar video length (D-09).
 */
async function probeDurationSeconds(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      path,
    ]);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${err}`));
      const secs = Number.parseFloat(out.trim());
      if (!Number.isFinite(secs)) return reject(new Error(`ffprobe parse failed: ${out}`));
      resolve(secs);
    });
    proc.on("error", (e) => reject(e));
  });
}
