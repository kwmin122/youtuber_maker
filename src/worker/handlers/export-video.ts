import type { Job } from "bullmq";
import { eq, and, asc } from "drizzle-orm";
import { scenes, mediaAssets, audioTracks, projects, jobs, jobEvents } from "@/lib/db/schema";
import { exportVideo } from "@/lib/video/ffmpeg-export";
import { uploadMedia } from "@/lib/media/storage";
import type { ExportScene, ExportAudioTrack, ExportProgress } from "@/lib/video/types";
import { DEFAULT_SUBTITLE_STYLE } from "@/lib/video/types";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

export async function handleExportVideo(job: Job, db: DrizzleInstance) {
  const { jobId, userId, payload } = job.data;
  const { projectId, scriptId } = payload;

  // Validate required payload
  if (!projectId || !scriptId) {
    throw new Error("projectId and scriptId are required in payload");
  }

  try {
    // Update job status to active
    await db.update(jobs).set({ status: "active", currentStep: "Loading scenes", updatedAt: new Date() }).where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "started",
      data: { projectId, scriptId },
    });

    // 1. Load all scenes for this script, ordered by sceneIndex
    const sceneRows = await db
      .select()
      .from(scenes)
      .where(eq(scenes.scriptId, scriptId))
      .orderBy(asc(scenes.sceneIndex));

    if (sceneRows.length === 0) {
      throw new Error("No scenes found for this script");
    }

    // 2. Load media assets for each scene (prefer video > image, get audio)
    const exportScenes: ExportScene[] = [];

    for (const scene of sceneRows) {
      const assets = await db
        .select()
        .from(mediaAssets)
        .where(and(eq(mediaAssets.sceneId, scene.id), eq(mediaAssets.status, "completed")));

      // Find best visual media (prefer video, fallback to image)
      const videoAsset = assets.find((a) => a.type === "video");
      const imageAsset = assets.find((a) => a.type === "image");
      const audioAsset = assets.find((a) => a.type === "audio");

      const visualAsset = videoAsset || imageAsset;
      if (!visualAsset) {
        throw new Error(`Scene ${scene.sceneIndex} has no completed visual media`);
      }

      exportScenes.push({
        sceneIndex: scene.sceneIndex,
        narration: scene.narration,
        duration: scene.duration || 3,
        mediaUrl: visualAsset.url,
        mediaType: visualAsset.type as "image" | "video",
        audioUrl: audioAsset?.url,
        subtitleStyle: (scene.subtitleStyle as ExportScene["subtitleStyle"]) || DEFAULT_SUBTITLE_STYLE,
        transitionType: (scene.transitionType as ExportScene["transitionType"]) || "cut",
        transitionDuration: scene.transitionDuration || 0,
      });
    }

    // 3. Load audio tracks (BGM/SFX) for this project
    const audioTrackRows = await db
      .select()
      .from(audioTracks)
      .where(eq(audioTracks.projectId, projectId));

    const exportAudioTracks: ExportAudioTrack[] = audioTrackRows.map((t) => ({
      url: t.url,
      type: t.type as "bgm" | "sfx",
      startTime: t.startTime,
      endTime: t.endTime,
      volume: t.volume,
    }));

    // 4. Run FFmpeg export with progress tracking
    await db.update(jobs).set({ currentStep: "Rendering video", updatedAt: new Date() }).where(eq(jobs.id, jobId));

    const progressCallback = async (progress: ExportProgress) => {
      await db.update(jobs).set({
        progress: progress.percent,
        currentStep: `${progress.phase}: ${progress.message || ""}`,
        updatedAt: new Date(),
      }).where(eq(jobs.id, jobId));

      // Insert job event for Realtime subscribers
      await db.insert(jobEvents).values({
        jobId,
        event: "progress",
        data: progress,
      });
    };

    const mp4Buffer = await exportVideo(
      {
        projectId,
        scenes: exportScenes,
        audioTracks: exportAudioTracks,
        outputWidth: 1080,
        outputHeight: 1920,
        fps: 30,
      },
      progressCallback
    );

    // 5. Upload to Supabase Storage
    await db.update(jobs).set({ currentStep: "Uploading to storage", progress: 90, updatedAt: new Date() }).where(eq(jobs.id, jobId));

    const filename = `export-${Date.now()}.mp4`;
    const uploaded = await uploadMedia({
      userId,
      projectId,
      sceneId: "exports", // virtual scene folder for exports
      filename,
      buffer: mp4Buffer,
      contentType: "video/mp4",
    });

    // 6. Update project with exported video URL
    await db.update(projects).set({
      exportedVideoUrl: uploaded.publicUrl,
      exportedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(projects.id, projectId));

    // 7. Mark job complete
    await db.update(jobs).set({
      status: "completed",
      progress: 100,
      currentStep: "Export complete",
      result: { url: uploaded.publicUrl, storagePath: uploaded.storagePath },
      updatedAt: new Date(),
    }).where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: { url: uploaded.publicUrl },
    });

    return { url: uploaded.publicUrl };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await db.update(jobs).set({
      status: "failed",
      errorMessage,
      updatedAt: new Date(),
    }).where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "failed",
      data: { error: errorMessage },
    });

    throw error;
  }
}
