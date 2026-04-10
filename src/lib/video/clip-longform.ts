import { spawn } from "child_process";
import { parseFFmpegProgress } from "./ffmpeg-export";

/**
 * Longform → 9:16 shorts clip helper.
 *
 * Spawns FFmpeg directly (no fluent-ffmpeg) to extract a segment from
 * `inputPath` between `startMs` and `endMs`, center-crop to 9:16, scale
 * to 1080x1920 at 30 fps, and write to `outputPath` as an MP4 with
 * libx264 video + AAC audio and `+faststart` for fast web playback.
 *
 * Uses input seek (`-ss` before `-i`) for performance. This is not
 * frame-accurate but ±50ms error is acceptable for shorts.
 */
export type ClipRequest = {
  inputPath: string;
  outputPath: string;
  startMs: number;
  endMs: number;
};

/**
 * Pure helper for building the FFmpeg argv. Extracted so unit tests can
 * assert on the exact filter/codec flags without having to spawn a real
 * process.
 */
export function buildClipArgs(req: ClipRequest): string[] {
  if (!Number.isFinite(req.startMs) || !Number.isFinite(req.endMs)) {
    throw new Error(
      `Invalid clip range: startMs=${req.startMs}, endMs=${req.endMs}`
    );
  }
  if (req.endMs <= req.startMs) {
    throw new Error(
      `Invalid clip range: endMs (${req.endMs}) must be > startMs (${req.startMs})`
    );
  }

  const startSec = (req.startMs / 1000).toFixed(3);
  const endSec = (req.endMs / 1000).toFixed(3);

  return [
    "-y",
    "-ss",
    startSec,
    "-to",
    endSec,
    "-i",
    req.inputPath,
    "-vf",
    "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920,fps=30",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-movflags",
    "+faststart",
    req.outputPath,
  ];
}

export async function clipLongform9x16(
  req: ClipRequest,
  onProgress?: (percent: number) => void
): Promise<void> {
  const args = buildClipArgs(req);
  const duration = (req.endMs - req.startMs) / 1000;

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderrTail = "";

    proc.stderr.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderrTail = (stderrTail + chunk).slice(-4000);
      if (onProgress) {
        const lines = chunk.split(/\r|\n/);
        for (const line of lines) {
          const pct = parseFFmpegProgress(line, duration);
          if (pct !== null) onProgress(pct);
        }
      }
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `ffmpeg clip failed (code=${code}): ${stderrTail.slice(-1000)}`
          )
        );
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });
  });
}
