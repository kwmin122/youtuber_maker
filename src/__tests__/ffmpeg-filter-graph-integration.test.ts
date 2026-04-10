/**
 * Integration test for Phase 7 retry 2 CRITICAL-1.
 *
 * Codex review ran actual FFmpeg against the retry-1 filter graph and
 * it died with `Stream specifier 'a0' matches no streams`. This test
 * reproduces that environment end-to-end:
 *
 *   1. Generate a tiny synthetic 9:16 mp4 with both a red video stream
 *      and a 440Hz sine audio stream via `ffmpeg -f lavfi`.
 *   2. Build a filter graph for a longform-clip scene that uses the
 *      same mp4 as BOTH the visual input AND the narration audio
 *      input (this mirrors create-child-project.ts inserting a
 *      type='audio' media_asset that points at the same clipped mp4).
 *   3. Actually spawn ffmpeg with `-filter_complex` + `-map [vout]`
 *      + `-map [aout]` and assert exit code 0 + output file > 0 bytes.
 *
 * If FFmpeg is not installed on the test host (CI without ffmpeg), the
 * test is skipped. On the local dev machine and the Railway worker
 * image, ffmpeg is always available.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { spawn, spawnSync } from "child_process";
import { mkdtemp, rm, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { buildFullFilterGraph } from "@/lib/video/ffmpeg-filter-graph";
import { DEFAULT_SUBTITLE_STYLE } from "@/lib/video/types";
import type { ExportRequest } from "@/lib/video/types";

const ffmpegAvailable = (() => {
  try {
    const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return r.status === 0;
  } catch {
    return false;
  }
})();

function runFfmpeg(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      resolve({ code: code ?? -1, stderr });
    });
  });
}

describe.runIf(ffmpegAvailable)(
  "ffmpeg filter graph integration (real FFmpeg)",
  () => {
    let workDir: string;
    let testMp4: string;

    beforeAll(async () => {
      workDir = await mkdtemp(join(tmpdir(), "phase7-ffmpeg-it-"));
      testMp4 = join(workDir, "test.mp4");

      // Generate a 1.5s 9:16 mp4 with red video + 440Hz sine audio.
      // Uses mpeg4+aac so this runs on stock/conda FFmpeg builds that
      // omit GPL codecs like libx264. The filter-graph correctness we
      // validate downstream is codec-independent.
      const r = await runFfmpeg([
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=1080x1920:d=1.5:r=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1.5",
        "-c:v",
        "mpeg4",
        "-q:v",
        "5",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        "-shortest",
        testMp4,
      ]);
      expect(r.code, `test mp4 generation failed: ${r.stderr}`).toBe(0);
    }, 60_000);

    it(
      "builds a longform-clip filter graph that actually runs through real FFmpeg without '[a0] matches no streams'",
      async () => {
        // Mirrors the media_assets shape Phase 7 writes for a longform
        // child project: one video asset + one audio asset both
        // pointing at the same clipped mp4.
        const request: ExportRequest = {
          projectId: "integration-test",
          scenes: [
            {
              sceneIndex: 0,
              narration: "longform clip",
              duration: 1,
              mediaUrl: testMp4,
              mediaType: "video",
              audioUrl: testMp4,
              subtitleStyle: DEFAULT_SUBTITLE_STYLE,
              transitionType: "cut",
              transitionDuration: 0,
            },
          ],
          audioTracks: [],
          outputWidth: 1080,
          outputHeight: 1920,
          fps: 30,
        };

        const { filterComplex, outputMaps } = buildFullFilterGraph(request);
        expect(outputMaps).toContain("[vout]");
        expect(outputMaps).toContain("[aout]");

        const outputPath = join(workDir, "out.mp4");

        // Mirrors ffmpeg-export.ts input ordering:
        //   input 0: scene visual (testMp4)
        //   input 1: narration (same testMp4, treated as audio-only)
        const args: string[] = [
          "-y",
          "-i",
          testMp4,
          "-i",
          testMp4,
          "-filter_complex",
          filterComplex,
        ];
        for (const m of outputMaps) {
          args.push("-map", m);
        }
        args.push(
          // Use mpeg4 (not libx264) so this test runs on stock/conda
          // FFmpeg builds without GPL codecs. The Railway worker image
          // ships libx264, but the filter-graph correctness we are
          // validating here is codec-independent.
          "-c:v",
          "mpeg4",
          "-q:v",
          "5",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "64k",
          "-t",
          "1",
          outputPath
        );

        const r = await runFfmpeg(args);
        // The exact Codex failure signature — make it show up clearly
        // in the assertion message if the regression comes back.
        expect(
          r.stderr,
          "filter graph leaked '[a0] matches no streams'"
        ).not.toMatch(/Stream specifier 'a0' matches no streams/);
        expect(r.stderr).not.toMatch(/\[aout\].*matches no streams/);
        expect(r.code, `ffmpeg failed: ${r.stderr.slice(-1500)}`).toBe(0);

        const info = await stat(outputPath);
        expect(info.size).toBeGreaterThan(0);
      },
      120_000
    );

    it(
      "builds a multi-scene (image + TTS) filter graph that actually runs through real FFmpeg (v1 regression guard)",
      async () => {
        // Make a tiny still PNG + short mp3 to exercise the v1 path
        // with two image scenes and two narration tracks.
        const pngA = join(workDir, "a.png");
        const pngB = join(workDir, "b.png");
        const mp3A = join(workDir, "a.mp3");
        const mp3B = join(workDir, "b.mp3");

        const mk = async (args: string[]) => {
          const r = await runFfmpeg(args);
          expect(r.code, r.stderr).toBe(0);
        };

        await mk([
          "-y",
          "-f",
          "lavfi",
          "-i",
          "color=c=blue:s=1080x1920:d=0.1",
          "-frames:v",
          "1",
          pngA,
        ]);
        await mk([
          "-y",
          "-f",
          "lavfi",
          "-i",
          "color=c=green:s=1080x1920:d=0.1",
          "-frames:v",
          "1",
          pngB,
        ]);
        await mk([
          "-y",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:duration=1",
          "-c:a",
          "libmp3lame",
          "-b:a",
          "64k",
          mp3A,
        ]);
        await mk([
          "-y",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=660:duration=1",
          "-c:a",
          "libmp3lame",
          "-b:a",
          "64k",
          mp3B,
        ]);

        const request: ExportRequest = {
          projectId: "integration-test-v1",
          scenes: [
            {
              sceneIndex: 0,
              narration: "scene a",
              duration: 1,
              mediaUrl: pngA,
              mediaType: "image",
              audioUrl: mp3A,
              subtitleStyle: DEFAULT_SUBTITLE_STYLE,
              transitionType: "cut",
              transitionDuration: 0,
            },
            {
              sceneIndex: 1,
              narration: "scene b",
              duration: 1,
              mediaUrl: pngB,
              mediaType: "image",
              audioUrl: mp3B,
              subtitleStyle: DEFAULT_SUBTITLE_STYLE,
              transitionType: "cut",
              transitionDuration: 0,
            },
          ],
          audioTracks: [],
          outputWidth: 1080,
          outputHeight: 1920,
          fps: 30,
        };

        const { filterComplex, outputMaps } = buildFullFilterGraph(request);
        const outputPath = join(workDir, "out-v1.mp4");

        // ffmpeg-export.ts input ordering for images:
        //   `-loop 1 -t 30 -i pngA -loop 1 -t 30 -i pngB -i mp3A -i mp3B`
        const args: string[] = [
          "-y",
          "-loop",
          "1",
          "-t",
          "30",
          "-i",
          pngA,
          "-loop",
          "1",
          "-t",
          "30",
          "-i",
          pngB,
          "-i",
          mp3A,
          "-i",
          mp3B,
          "-filter_complex",
          filterComplex,
        ];
        for (const m of outputMaps) {
          args.push("-map", m);
        }
        args.push(
          // Use mpeg4 (not libx264) so this test runs on stock/conda
          // FFmpeg builds without GPL codecs. The Railway worker image
          // ships libx264, but the filter-graph correctness we are
          // validating here is codec-independent.
          "-c:v",
          "mpeg4",
          "-q:v",
          "5",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "64k",
          "-t",
          "2",
          outputPath
        );

        const r = await runFfmpeg(args);
        expect(r.stderr).not.toMatch(/matches no streams/);
        expect(r.code, `ffmpeg failed: ${r.stderr.slice(-1500)}`).toBe(0);
        const info = await stat(outputPath);
        expect(info.size).toBeGreaterThan(0);
      },
      120_000
    );

    // Cleanup
    it("cleans up workdir", async () => {
      await rm(workDir, { recursive: true, force: true });
    });
  }
);

describe.runIf(!ffmpegAvailable)("ffmpeg filter graph integration (skipped — ffmpeg not on PATH)", () => {
  it("skipped", () => {
    expect(true).toBe(true);
  });
});
