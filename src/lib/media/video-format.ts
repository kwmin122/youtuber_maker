import { spawn } from "child_process";
import { writeFile, readFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import type { UploadPlatform } from "@/lib/distribution/types";

/**
 * Platform-specific video format limits.
 *
 * IMPORTANT: Uses child_process.spawn per CLAUDE.md requirement (fluent-ffmpeg is banned).
 */
export const PLATFORM_LIMITS = {
  youtube: { maxDurationSeconds: 60,  aspectRatio: "9:16" },
  tiktok:  { maxDurationSeconds: 180, aspectRatio: "9:16" },
  reels:   { maxDurationSeconds: 90,  aspectRatio: "9:16" },
} as const satisfies Record<UploadPlatform, { maxDurationSeconds: number; aspectRatio: string }>;

/** Result of ensurePlatformFormat */
export interface VideoFormatResult {
  buffer: Buffer;
  durationSeconds: number;
  wasConverted: boolean;
}

/** Raw probe info returned from ffprobe */
interface ProbeResult {
  durationSeconds: number;
  width: number;
  height: number;
}

/**
 * Probe a video buffer using ffprobe and return duration + dimensions.
 *
 * @param buffer - Raw video file buffer
 * @returns Duration in seconds, width and height in pixels
 */
export async function probeVideoFormat(buffer: Buffer): Promise<ProbeResult> {
  const tempDir = await mkdtemp(join(tmpdir(), "vf-"));
  const tempFile = join(tempDir, "input.mp4");
  await writeFile(tempFile, buffer);

  try {
    const json = await runFFprobe([
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      "-show_format",
      tempFile,
    ]);

    const parsed = JSON.parse(json) as {
      format?: { duration?: string };
      streams?: { codec_type?: string; width?: number; height?: number }[];
    };

    const durationSeconds = parseFloat(parsed.format?.duration ?? "0");

    const videoStream = (parsed.streams ?? []).find(
      (s) => s.codec_type === "video"
    );

    const width = videoStream?.width ?? 0;
    const height = videoStream?.height ?? 0;

    return { durationSeconds, width, height };
  } finally {
    await safeUnlink(tempFile);
    await safeUnlink(tempDir);
  }
}

/**
 * Validate and convert a video buffer to meet platform-specific format requirements.
 *
 * Checks:
 * - Aspect ratio must be 9:16 (±1% tolerance). If not, letterboxes to 1080x1920.
 * - Duration must be within PLATFORM_LIMITS[platform].maxDurationSeconds. If not, trims.
 *
 * @param buffer   - Raw video buffer
 * @param platform - Target upload platform
 * @returns VideoFormatResult with possibly-converted buffer
 */
export async function ensurePlatformFormat(
  buffer: Buffer,
  platform: UploadPlatform
): Promise<VideoFormatResult> {
  const { durationSeconds, width, height } = await probeVideoFormat(buffer);
  const maxDuration = PLATFORM_LIMITS[platform].maxDurationSeconds;

  const currentRatio = height > 0 ? width / height : 0;
  const targetRatio = 9 / 16; // 0.5625
  const needsRatioFix = Math.abs(currentRatio - targetRatio) > 0.01;
  const needsTrim = durationSeconds > maxDuration;

  if (!needsRatioFix && !needsTrim) {
    return { buffer, durationSeconds, wasConverted: false };
  }

  // Conversion needed — build FFmpeg args
  const tempDir = await mkdtemp(join(tmpdir(), "vf-conv-"));
  const inputPath = join(tempDir, "input.mp4");
  const outputPath = join(tempDir, "output.mp4");
  await writeFile(inputPath, buffer);

  try {
    const args: string[] = ["-i", inputPath];

    if (needsRatioFix) {
      // Letterbox to 1080x1920 (9:16) preserving original aspect ratio
      args.push(
        "-vf",
        "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black"
      );
    }

    if (needsTrim) {
      args.push("-t", String(maxDuration));
    }

    // Re-encode audio as-is, copy if possible otherwise re-encode
    if (!needsRatioFix) {
      args.push("-c:v", "copy");
    }

    args.push("-c:a", "copy", "-y", outputPath);

    await runFFmpeg(args);

    const outputBuffer = await readFile(outputPath);
    const finalDuration = Math.min(durationSeconds, maxDuration);

    return { buffer: outputBuffer, durationSeconds: finalDuration, wasConverted: true };
  } finally {
    await safeUnlink(inputPath);
    await safeUnlink(outputPath);
    await safeUnlink(tempDir);
  }
}

// --------------- Internal helpers ---------------

/**
 * Spawn ffprobe and capture stdout JSON output.
 */
function runFFprobe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", args, { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr.slice(0, 500)}`));
      }
    });

    proc.on("error", (err) => reject(new Error(`ffprobe spawn error: ${err.message}`)));
  });
}

/**
 * Spawn ffmpeg and wait for successful exit.
 */
function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(0, 500)}`));
      }
    });

    proc.on("error", (err) => reject(new Error(`FFmpeg spawn error: ${err.message}`)));
  });
}

/** Silently unlink a path — does not throw if missing. */
async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // ignore
  }
}
