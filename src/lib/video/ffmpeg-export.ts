import { spawn } from "child_process";
import { writeFile, readFile, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { downloadFromUrl } from "@/lib/media/storage";
import { buildFullFilterGraph } from "./ffmpeg-filter-graph";
import type { ExportRequest, ExportProgress } from "./types";

/**
 * Parse FFmpeg progress from stderr output.
 * Extracts time= from lines like: "frame=  120 fps= 30 ... time=00:00:04.00 ..."
 * Returns percentage (0-100) based on totalDuration.
 */
export function parseFFmpegProgress(
  stderrLine: string,
  totalDuration: number
): number | null {
  const match = stderrLine.match(/time=(\d+):(\d+):(\d+\.?\d*)/);
  if (!match) return null;

  const hours = parseFloat(match[1]);
  const minutes = parseFloat(match[2]);
  const seconds = parseFloat(match[3]);
  const currentTime = hours * 3600 + minutes * 60 + seconds;

  if (totalDuration <= 0) return 0;
  return Math.min(100, Math.round((currentTime / totalDuration) * 100));
}

/**
 * Export a video by spawning FFmpeg with filter_complex.
 * Downloads all media, builds filter graph, renders MP4, returns Buffer.
 *
 * IMPORTANT: Uses child_process.spawn per CLAUDE.md requirement.
 * NEVER uses fluent-ffmpeg.
 */
export async function exportVideo(
  request: ExportRequest,
  onProgress: (progress: ExportProgress) => void
): Promise<Buffer> {
  const tempDir = await mkdtemp(join(tmpdir(), "export-"));

  try {
    // --- Phase 1: Download all media files ---
    onProgress({
      phase: "downloading",
      percent: 0,
      totalScenes: request.scenes.length,
      message: "Starting downloads",
    });

    const inputFiles: string[] = [];
    const totalDownloads =
      request.scenes.length +
      request.scenes.filter((s) => s.audioUrl).length +
      request.audioTracks.length;
    let downloadsComplete = 0;

    // Download scene media (images/videos)
    for (let i = 0; i < request.scenes.length; i++) {
      const scene = request.scenes[i];
      const ext = scene.mediaType === "video" ? "mp4" : "png";
      const filePath = join(tempDir, `scene-${i}.${ext}`);

      const buffer = await downloadFromUrl(scene.mediaUrl);
      await writeFile(filePath, buffer);
      inputFiles.push(filePath);

      downloadsComplete++;
      onProgress({
        phase: "downloading",
        percent: Math.round((downloadsComplete / totalDownloads) * 30),
        currentScene: i,
        totalScenes: request.scenes.length,
        message: `Downloaded scene ${i + 1} media`,
      });
    }

    // Download scene audio (TTS narration)
    const audioFiles: string[] = [];
    for (let i = 0; i < request.scenes.length; i++) {
      const scene = request.scenes[i];
      if (scene.audioUrl) {
        const filePath = join(tempDir, `narration-${i}.mp3`);
        const buffer = await downloadFromUrl(scene.audioUrl);
        await writeFile(filePath, buffer);
        audioFiles.push(filePath);

        downloadsComplete++;
        onProgress({
          phase: "downloading",
          percent: Math.round((downloadsComplete / totalDownloads) * 30),
          currentScene: i,
          totalScenes: request.scenes.length,
          message: `Downloaded scene ${i + 1} audio`,
        });
      }
    }

    // Download BGM/SFX tracks
    const bgmFiles: string[] = [];
    for (let i = 0; i < request.audioTracks.length; i++) {
      const track = request.audioTracks[i];
      const filePath = join(tempDir, `bgm-${i}.mp3`);
      const buffer = await downloadFromUrl(track.url);
      await writeFile(filePath, buffer);
      bgmFiles.push(filePath);

      downloadsComplete++;
      onProgress({
        phase: "downloading",
        percent: Math.round((downloadsComplete / totalDownloads) * 30),
        message: `Downloaded audio track ${i + 1}`,
      });
    }

    // Phase 8: Download avatar lipsync videos.
    // Input ordering contract: [scenes][narrations][bgms][avatars]
    // This MUST match the avatarBaseIndex computed in buildFullFilterGraph.
    const avatarFiles: string[] = [];
    const avatarScenes = request.scenes.filter(
      (s) => s.avatarVideoUrl && s.avatarLayout?.enabled
    );
    for (let i = 0; i < avatarScenes.length; i++) {
      const scene = avatarScenes[i];
      const filePath = join(tempDir, `avatar-${i}.mp4`);
      const buffer = await downloadFromUrl(scene.avatarVideoUrl!);
      await writeFile(filePath, buffer);
      avatarFiles.push(filePath);
    }

    // --- Phase 2: Build FFmpeg command and render ---
    onProgress({
      phase: "rendering",
      percent: 30,
      totalScenes: request.scenes.length,
      message: "Building filter graph",
    });

    const { filterComplex, outputMaps } = buildFullFilterGraph(request);
    const outputPath = join(tempDir, "output.mp4");

    // Calculate total duration for progress tracking
    const totalDuration = request.scenes.reduce((sum, s, i) => {
      if (i === 0) return s.duration;
      const overlap =
        s.transitionType !== "cut" ? s.transitionDuration : 0;
      return sum + s.duration - overlap;
    }, 0);

    // Build FFmpeg args
    const args: string[] = [];

    // Input files: scene media
    for (const file of inputFiles) {
      // For images, add loop flag before input
      if (file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg")) {
        args.push("-loop", "1", "-t", "30"); // loop image, max 30s
      }
      args.push("-i", file);
    }

    // Input files: narration audio
    for (const file of audioFiles) {
      args.push("-i", file);
    }

    // Input files: BGM/SFX
    for (const file of bgmFiles) {
      args.push("-i", file);
    }

    // Input files: avatar lipsync videos (Phase 8)
    // MUST come after BGMs to match the [scenes][narrations][bgms][avatars] contract
    for (const file of avatarFiles) {
      args.push("-i", file);
    }

    // Filter complex
    args.push("-filter_complex", filterComplex);

    // Output mappings
    for (const map of outputMaps) {
      args.push("-map", map);
    }

    // Output codec settings
    args.push(
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "128k",
      "-s", `${request.outputWidth}x${request.outputHeight}`,
      "-r", String(request.fps),
      "-y", // overwrite output
      outputPath
    );

    // Spawn FFmpeg
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("ffmpeg", args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stderr = "";

      proc.stderr.on("data", (chunk: Buffer) => {
        const line = chunk.toString();
        stderr += line;

        // Parse progress from FFmpeg stderr
        const percent = parseFFmpegProgress(line, totalDuration);
        if (percent !== null) {
          // Map render progress to 30-90% range
          const mappedPercent = 30 + Math.round(percent * 0.6);
          onProgress({
            phase: "rendering",
            percent: mappedPercent,
            totalScenes: request.scenes.length,
            message: `Rendering: ${percent}%`,
          });
        }
      });

      proc.on("close", (code) => {
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(
            new Error(
              `FFmpeg export failed with code ${code}: ${stderr.slice(0, 1000)}`
            )
          );
        }
      });

      proc.on("error", (err) => {
        reject(new Error(`FFmpeg spawn failed: ${err.message}`));
      });
    });

    // --- Phase 3: Read output ---
    onProgress({
      phase: "uploading",
      percent: 90,
      message: "Reading output file",
    });

    const outputBuffer = await readFile(outputPath);
    return outputBuffer;
  } finally {
    // Clean up temp directory and all files
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
