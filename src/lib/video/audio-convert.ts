import { spawn } from "child_process";

/**
 * Convert an input audio file to 16 kHz mono WAV. HeyGen's lipsync
 * endpoint performs best when fed 16 kHz mono WAV; D-ID accepts MP3
 * too but we standardize here to keep the handler's provider-fallback
 * path free of branches.
 *
 * Phase 8 D-10: called from generate-avatar-lipsync handler before
 * provider submit. Mirrors the spawn pattern in extract-audio.ts.
 *
 * Per CLAUDE.md: always use `child_process.spawn`; fluent-ffmpeg is banned.
 */
export async function convertToWav16kMono(
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y", // overwrite outputs (retry safety)
      "-i", inputPath,
      "-ar", "16000",
      "-ac", "1",
      "-f", "wav",
      outputPath,
    ];
    const proc = spawn("ffmpeg", args);

    let stderrTail = "";
    proc.stderr.on("data", (d: Buffer) => {
      stderrTail = (stderrTail + d.toString()).slice(-2000);
    });

    proc.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg wav convert failed (${code}): ${stderrTail}`));
    });
    proc.on("error", (err) => reject(new Error(`ffmpeg spawn failed: ${err.message}`)));
  });
}
