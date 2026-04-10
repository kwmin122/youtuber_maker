import { spawn } from "child_process";

/**
 * Thin spawn-based wrapper around the `yt-dlp` binary.
 *
 * IMPORTANT: per CLAUDE.md, we ALWAYS use `child_process.spawn`.
 * Never use `exec` / `execSync` — they buffer the whole child
 * output in memory and are unsafe for large downloads.
 *
 * The `yt-dlp` binary is installed in the Railway worker image
 * via the Dockerfile (pip3 install yt-dlp).
 */
export type YtDlpMetadata = {
  id: string;
  title: string;
  durationSeconds: number;
  webpageUrl: string;
  ext: string;
  filesizeApprox: number | null;
};

/**
 * Run `yt-dlp --dump-json --skip-download <url>` and parse the
 * JSON manifest describing the video. Does NOT download anything.
 */
export async function probeVideoMetadata(
  url: string
): Promise<YtDlpMetadata> {
  return new Promise((resolve, reject) => {
    const args = [
      "--dump-json",
      "--no-warnings",
      "--skip-download",
      url,
    ];
    const proc = spawn("yt-dlp", args);

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
          new Error(
            `yt-dlp probe failed (${code}): ${stderr.slice(0, 1000)}`
          )
        );
      }
      try {
        const json = JSON.parse(stdout);
        if (typeof json.duration !== "number") {
          return reject(
            new Error(
              `yt-dlp probe returned no duration for ${url}`
            )
          );
        }
        resolve({
          id: String(json.id ?? ""),
          title: String(json.title ?? ""),
          durationSeconds: Math.round(json.duration),
          webpageUrl: String(json.webpage_url ?? url),
          ext: String(json.ext ?? "mp4"),
          filesizeApprox:
            typeof json.filesize_approx === "number"
              ? json.filesize_approx
              : null,
        });
      } catch (err) {
        reject(
          new Error(
            `yt-dlp probe JSON parse failed: ${(err as Error).message}`
          )
        );
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`yt-dlp spawn failed: ${err.message}`));
    });
  });
}

/**
 * Download the video (capped at 720p) to `outputPath`.
 * Progress is reported through the stdout `[download]` lines
 * that yt-dlp prints, e.g. "[download]  12.3% of 150.00MiB ...".
 */
export async function downloadVideo(
  url: string,
  outputPath: string,
  onProgress?: (percent: number) => void | Promise<void>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-f",
      "bv*[height<=720]+ba/b[height<=720]",
      "--merge-output-format",
      "mp4",
      "--no-warnings",
      "--newline", // one progress line per update
      "-o",
      outputPath,
      url,
    ];
    const proc = spawn("yt-dlp", args);

    let stderrTail = "";
    let lastReportedPct = -1;

    proc.stdout.on("data", (d: Buffer) => {
      const text = d.toString();
      // Each update can contain multiple lines; match all of them
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
        if (match) {
          const pct = parseFloat(match[1]);
          // Only fire when percentage moves ≥ 1 point to avoid DB spam
          if (onProgress && pct - lastReportedPct >= 1) {
            lastReportedPct = pct;
            try {
              const maybe = onProgress(pct);
              if (maybe && typeof (maybe as Promise<void>).catch === "function") {
                (maybe as Promise<void>).catch(() => {
                  /* swallow: progress is best-effort */
                });
              }
            } catch {
              /* swallow: progress is best-effort */
            }
          }
        }
      }
    });

    proc.stderr.on("data", (d: Buffer) => {
      stderrTail = (stderrTail + d.toString()).slice(-4000);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `yt-dlp download failed (${code}): ${stderrTail.slice(0, 1000)}`
          )
        );
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`yt-dlp spawn failed: ${err.message}`));
    });
  });
}
