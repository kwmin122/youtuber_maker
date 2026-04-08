import { spawn } from "child_process";
import { writeFile, readFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

/** Silence removal options */
export interface SilenceRemovalOptions {
  /** Minimum silence duration to detect (in seconds, default: 0.3) */
  minSilenceDuration?: number;
  /** Silence threshold in dB (default: -30) */
  silenceThreshold?: number;
  /** Padding to keep around speech (in seconds, default: 0.1) */
  padding?: number;
}

/** Silence segment detected in audio */
export interface SilenceSegment {
  start: number; // seconds
  end: number; // seconds
  duration: number; // seconds
}

/**
 * Detect silence segments in an audio file using FFmpeg silencedetect filter.
 *
 * IMPORTANT: Uses child_process.spawn per CLAUDE.md requirement.
 *
 * @param audioBuffer - Raw audio file buffer
 * @param options - Detection thresholds
 * @returns Array of detected silence segments
 */
export async function detectSilence(
  audioBuffer: Buffer,
  options?: SilenceRemovalOptions
): Promise<SilenceSegment[]> {
  const minDuration = options?.minSilenceDuration ?? 0.3;
  const threshold = options?.silenceThreshold ?? -30;

  // Write buffer to temp file
  const tempDir = await mkdtemp(join(tmpdir(), "silence-"));
  const inputPath = join(tempDir, "input.mp3");
  await writeFile(inputPath, audioBuffer);

  try {
    const stderr = await runFFmpeg([
      "-i", inputPath,
      "-af", `silencedetect=noise=${threshold}dB:d=${minDuration}`,
      "-f", "null",
      "-",
    ]);

    return parseSilenceDetectOutput(stderr);
  } finally {
    // Cleanup temp files
    await safeUnlink(inputPath);
    await safeUnlink(tempDir);
  }
}

/**
 * Remove silence segments from audio using FFmpeg.
 *
 * Strategy: detect silence, build filter to keep non-silent segments,
 * concatenate them with crossfade.
 *
 * @param audioBuffer - Raw audio file buffer
 * @param options - Silence detection options
 * @returns Buffer with silence removed
 */
export async function removeSilence(
  audioBuffer: Buffer,
  options?: SilenceRemovalOptions
): Promise<Buffer> {
  const padding = options?.padding ?? 0.1;

  // Step 1: Detect silence segments
  const silences = await detectSilence(audioBuffer, options);

  if (silences.length === 0) {
    // No silence detected, return original
    return audioBuffer;
  }

  // Step 2: Build non-silent segments
  const tempDir = await mkdtemp(join(tmpdir(), "silence-rm-"));
  const inputPath = join(tempDir, "input.mp3");
  const outputPath = join(tempDir, "output.mp3");
  await writeFile(inputPath, audioBuffer);

  try {
    // Get total duration
    const totalDuration = await getAudioDuration(inputPath);

    // Build segment list (non-silent portions)
    const segments = buildNonSilentSegments(silences, totalDuration, padding);

    if (segments.length === 0) {
      // Everything is silence
      return audioBuffer;
    }

    // Build complex filter for concatenation
    const filterParts: string[] = [];
    const streamLabels: string[] = [];

    segments.forEach((seg, i) => {
      filterParts.push(
        `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}]`
      );
      streamLabels.push(`[a${i}]`);
    });

    const concatFilter = `${streamLabels.join("")}concat=n=${segments.length}:v=0:a=1[out]`;
    const fullFilter = [...filterParts, concatFilter].join(";");

    await runFFmpeg([
      "-i", inputPath,
      "-filter_complex", fullFilter,
      "-map", "[out]",
      "-y",
      outputPath,
    ]);

    const result = await readFile(outputPath);
    return result;
  } finally {
    await safeUnlink(inputPath);
    await safeUnlink(outputPath);
    await safeUnlink(tempDir);
  }
}

/**
 * Get audio duration using FFmpeg.
 */
async function getAudioDuration(filePath: string): Promise<number> {
  const stderr = await runFFmpeg([
    "-i", filePath,
    "-f", "null",
    "-",
  ]);

  const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
  if (!durationMatch) {
    throw new Error("Could not determine audio duration");
  }

  const hours = parseFloat(durationMatch[1]);
  const minutes = parseFloat(durationMatch[2]);
  const seconds = parseFloat(durationMatch[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Run FFmpeg with spawn and capture stderr output.
 * Rejects if FFmpeg exits with non-zero code.
 */
function runFFmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0 || code === null) {
        resolve(stderr);
      } else {
        // FFmpeg silencedetect writes to stderr even on success
        // Only reject if it's a real error
        if (stderr.includes("silencedetect") || stderr.includes("Duration")) {
          resolve(stderr);
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(0, 500)}`));
        }
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`FFmpeg spawn failed: ${err.message}`));
    });
  });
}

/**
 * Parse FFmpeg silencedetect filter output from stderr.
 */
function parseSilenceDetectOutput(stderr: string): SilenceSegment[] {
  const segments: SilenceSegment[] = [];
  const startRegex = /silence_start:\s*([\d.]+)/g;
  const endRegex = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;

  const starts: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = startRegex.exec(stderr)) !== null) {
    starts.push(parseFloat(match[1]));
  }

  let i = 0;
  while ((match = endRegex.exec(stderr)) !== null) {
    if (i < starts.length) {
      segments.push({
        start: starts[i],
        end: parseFloat(match[1]),
        duration: parseFloat(match[2]),
      });
      i++;
    }
  }

  return segments;
}

/**
 * Build non-silent segments from silence segments.
 * Returns time ranges that should be kept.
 */
function buildNonSilentSegments(
  silences: SilenceSegment[],
  totalDuration: number,
  padding: number
): Array<{ start: number; end: number }> {
  const segments: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  for (const silence of silences) {
    const segStart = cursor;
    const segEnd = Math.max(cursor, silence.start + padding);

    if (segEnd > segStart + 0.05) {
      // Minimum segment length
      segments.push({ start: segStart, end: segEnd });
    }

    cursor = Math.max(cursor, silence.end - padding);
  }

  // Add final segment after last silence
  if (cursor < totalDuration - 0.05) {
    segments.push({ start: cursor, end: totalDuration });
  }

  return segments;
}

/**
 * Safe file deletion (ignore if file doesn't exist).
 */
async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // Ignore -- file may not exist or be a directory
  }
}
