/**
 * Integration test for Phase 8 avatar overlay filter graph (Plan 08-04).
 *
 * PLANS.md rule 8: "Any FFmpeg filter graph change requires a REAL ffmpeg
 * integration test. Mocks are insufficient for filter_complex — the filter
 * grammar is runtime-validated by ffmpeg itself."
 *
 * Test strategy:
 *   1. Build a filter graph for two scenes — scene 0 has an avatar overlay
 *      (bottom-right PIP), scene 1 does not (v1 regression path).
 *   2. Invoke real `ffmpeg` with lavfi color sources as synthetic inputs
 *      matching the input-index contract: [scene0][scene1][avatar0].
 *   3. Assert exit code 0 and no error about mismatched stream specifiers.
 *
 * Tests are skipped cleanly if ffmpeg is not on PATH (dev without ffmpeg).
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { buildFullFilterGraph, buildAvatarOverlayFilters } from "@/lib/video/ffmpeg-filter-graph";
import type { ExportRequest } from "@/lib/video/types";

const ffmpegAvailable = (() => {
  try {
    const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return r.status === 0;
  } catch {
    return false;
  }
})();

describe.runIf(ffmpegAvailable)(
  "ffmpeg filter graph avatar overlay (real FFmpeg, Phase 8)",
  () => {
    it("builds a graph that ffmpeg accepts — scene with avatar PIP overlay", () => {
      // 2 scenes: scene 0 has avatar (bottom-right), scene 1 does not.
      // Input contract: [scene0][scene1][avatar0]
      const request: ExportRequest = {
        projectId: "avatar-overlay-integration-test",
        outputWidth: 1080,
        outputHeight: 1920,
        fps: 30,
        scenes: [
          {
            sceneIndex: 0,
            narration: "scene with avatar",
            duration: 2,
            mediaUrl: "lavfi:color=c=blue:s=1080x1920:d=2",
            mediaType: "video",
            audioUrl: undefined,
            subtitleStyle: null,
            transitionType: "cut",
            transitionDuration: 0,
            avatarVideoUrl: "lavfi:color=c=red:s=540x540:d=2",
            avatarLayout: {
              enabled: true,
              position: "bottom-right",
              scale: 0.35,
              paddingPx: 24,
            },
          },
          {
            sceneIndex: 1,
            narration: "scene without avatar",
            duration: 2,
            mediaUrl: "lavfi:color=c=green:s=1080x1920:d=2",
            mediaType: "video",
            audioUrl: undefined,
            subtitleStyle: null,
            transitionType: "cut",
            transitionDuration: 0,
          },
        ],
        audioTracks: [],
      };

      const { filterComplex, outputMaps } = buildFullFilterGraph(request);
      expect(outputMaps).toContain("[vout]");

      // Input ordering: [scene0][scene1][avatar0]
      // scene0 = blue 1080x1920, scene1 = green 1080x1920, avatar0 = red 540x540
      const result = spawnSync(
        "ffmpeg",
        [
          "-y",
          "-f", "lavfi", "-i", "color=c=blue:s=1080x1920:d=2:r=30",
          "-f", "lavfi", "-i", "color=c=green:s=1080x1920:d=2:r=30",
          "-f", "lavfi", "-i", "color=c=red:s=540x540:d=2:r=30",
          "-filter_complex", filterComplex,
          "-map", "[vout]",
          "-c:v", "mpeg4",
          "-q:v", "5",
          "-pix_fmt", "yuv420p",
          "-t", "2",
          "-f", "null", "-",
        ],
        { encoding: "utf8" }
      );

      if (result.status !== 0) {
        console.error("ffmpeg stderr:\n", result.stderr);
      }
      expect(result.stderr ?? "").not.toMatch(/matches no streams/);
      expect(result.status).toBe(0);
    });

    it("falls back to v1 behavior when no scene has avatar (regression guard)", () => {
      // Single scene, no avatar — must produce same [vout] as before Phase 8.
      const request: ExportRequest = {
        projectId: "avatar-overlay-regression-test",
        outputWidth: 1080,
        outputHeight: 1920,
        fps: 30,
        scenes: [
          {
            sceneIndex: 0,
            narration: "no avatar",
            duration: 2,
            mediaUrl: "lavfi:color=c=blue:s=1080x1920:d=2",
            mediaType: "video",
            audioUrl: undefined,
            subtitleStyle: null,
            transitionType: "cut",
            transitionDuration: 0,
          },
        ],
        audioTracks: [],
      };

      const { filterComplex, outputMaps } = buildFullFilterGraph(request);
      expect(outputMaps).toContain("[vout]");
      // No avatar — must NOT have [aout] when there are no audio tracks
      expect(outputMaps).not.toContain("[aout]");

      const result = spawnSync(
        "ffmpeg",
        [
          "-y",
          "-f", "lavfi", "-i", "color=c=blue:s=1080x1920:d=2:r=30",
          "-filter_complex", filterComplex,
          "-map", "[vout]",
          "-c:v", "mpeg4",
          "-q:v", "5",
          "-pix_fmt", "yuv420p",
          "-t", "2",
          "-f", "null", "-",
        ],
        { encoding: "utf8" }
      );

      if (result.status !== 0) {
        console.error("ffmpeg stderr:\n", result.stderr);
      }
      expect(result.stderr ?? "").not.toMatch(/matches no streams/);
      expect(result.status).toBe(0);
    });

    it("buildAvatarOverlayFilters produces correct label overrides for all positions", () => {
      // Test each layout position — verify filter strings contain expected overlay expressions
      const positions = ["bottom-right", "bottom-left", "top-right", "center", "fullscreen"] as const;

      for (const position of positions) {
        const { filters, labelOverrides } = buildAvatarOverlayFilters(
          [{ inputIndex: 2, sceneIndex: 0, layout: { enabled: true, position, scale: 0.35, paddingPx: 24 } }],
          1080,
          1920
        );
        expect(filters).not.toBe("");
        expect(labelOverrides[0]).toBe("v0o");

        if (position === "fullscreen") {
          expect(filters).toContain("scale=1080:1920");
          expect(filters).toContain("overlay=0:0");
        } else if (position === "bottom-right") {
          expect(filters).toContain("W-w-24:H-h-24");
        } else if (position === "bottom-left") {
          expect(filters).toContain("24:H-h-24");
        } else if (position === "top-right") {
          expect(filters).toContain("W-w-24:24");
        } else if (position === "center") {
          expect(filters).toContain("(W-w)/2:(H-h)/2");
        }
      }
    });

    it("disabled avatar layout is skipped (no filters emitted)", () => {
      const { filters, labelOverrides } = buildAvatarOverlayFilters(
        [{ inputIndex: 2, sceneIndex: 0, layout: { enabled: false, position: "bottom-right", scale: 0.35, paddingPx: 24 } }],
        1080,
        1920
      );
      expect(filters).toBe("");
      expect(Object.keys(labelOverrides)).toHaveLength(0);
    });
  }
);

describe.runIf(!ffmpegAvailable)(
  "ffmpeg filter graph avatar overlay (skipped — ffmpeg not on PATH)",
  () => {
    it("skipped", () => {
      expect(true).toBe(true);
    });
  }
);
