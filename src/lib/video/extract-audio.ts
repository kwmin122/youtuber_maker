import { spawn } from "child_process";

/**
 * Extract a downsampled mono 32 kbps MP3 from a source video/audio file
 * for upload to Gemini Files API. 16 kHz / mono / 32 kbps keeps a full
 * hour of audio under ~15 MB, which bounds analysis cost (D-15 risk).
 *
 * Per CLAUDE.md: always use `child_process.spawn`; fluent-ffmpeg is
 * banned because it is unmaintained and not FFmpeg 7.x compatible.
 */
export async function extractAudioForAnalysis(
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i", inputPath,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-b:a", "32k",
      "-f", "mp3",
      outputPath,
    ];
    const proc = spawn("ffmpeg", args);

    let stderrTail = "";
    proc.stderr.on("data", (d: Buffer) => {
      stderrTail = (stderrTail + d.toString()).slice(-4000);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `ffmpeg audio extract failed (${code}): ${stderrTail.slice(0, 1000)}`
          )
        );
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });
  });
}
