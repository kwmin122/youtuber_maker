import { describe, it, expect } from "vitest";
import {
  buildSceneFilters,
  buildTransitionFilters,
  buildSubtitleFilter,
  buildAudioMixFilter,
  buildFullFilterGraph,
  escapeFFmpegText,
} from "@/lib/video/ffmpeg-filter-graph";
import { DEFAULT_SUBTITLE_STYLE } from "@/lib/video/types";
import type { SceneFilterConfig, ExportRequest } from "@/lib/video/types";

describe("escapeFFmpegText", () => {
  it("escapes colons and backslashes", () => {
    expect(escapeFFmpegText("hello: world\\test")).toBe("hello\\: world\\\\test");
  });

  it("escapes single quotes", () => {
    expect(escapeFFmpegText("it's")).toContain("\\'");
  });
});

describe("buildSceneFilters", () => {
  it("generates scale+pad for each scene", () => {
    const scenes: SceneFilterConfig[] = [
      { inputIndex: 0, duration: 3, hasSubtitle: false, transitionType: "cut", transitionDuration: 0 },
      { inputIndex: 1, duration: 4, hasSubtitle: false, transitionType: "cut", transitionDuration: 0 },
    ];
    const result = buildSceneFilters(scenes, 1080, 1920);
    expect(result).toContain("[v0]");
    expect(result).toContain("[v1]");
    expect(result).toContain("scale=1080:1920");
  });
});

describe("buildTransitionFilters", () => {
  it("uses xfade for fade transition", () => {
    const scenes: SceneFilterConfig[] = [
      { inputIndex: 0, duration: 3, hasSubtitle: false, transitionType: "cut", transitionDuration: 0 },
      { inputIndex: 1, duration: 4, hasSubtitle: false, transitionType: "fade", transitionDuration: 0.5 },
    ];
    const result = buildTransitionFilters(scenes);
    expect(result).toContain("xfade=transition=fade");
    expect(result).toContain("duration=0.5");
  });

  it("uses concat for cut-only scenes", () => {
    const scenes: SceneFilterConfig[] = [
      { inputIndex: 0, duration: 3, hasSubtitle: false, transitionType: "cut", transitionDuration: 0 },
      { inputIndex: 1, duration: 4, hasSubtitle: false, transitionType: "cut", transitionDuration: 0 },
    ];
    const result = buildTransitionFilters(scenes);
    expect(result).toContain("concat");
  });
});

describe("buildSubtitleFilter", () => {
  it("includes drawtext with font and position", () => {
    const result = buildSubtitleFilter("안녕하세요", DEFAULT_SUBTITLE_STYLE, 3);
    expect(result).toContain("drawtext");
    expect(result).toContain("fontsize=36");
  });

  it("positions bottom subtitle at y=h*0.85", () => {
    const result = buildSubtitleFilter("test", { ...DEFAULT_SUBTITLE_STYLE, position: "bottom" }, 3);
    expect(result).toContain("0.85");
  });
});

describe("buildAudioMixFilter", () => {
  it("concatenates narration tracks", () => {
    const result = buildAudioMixFilter(3, [], 15);
    expect(result).toContain("concat=n=3");
  });

  it("includes volume filter for BGM", () => {
    const result = buildAudioMixFilter(2, [{ startTime: 0, endTime: null, volume: 0.3 }], 10);
    expect(result).toContain("volume=0.3");
    expect(result).toContain("amix");
  });
});

describe("buildFullFilterGraph", () => {
  it("returns filterComplex string and output maps", () => {
    const request: ExportRequest = {
      projectId: "test-id",
      scenes: [
        {
          sceneIndex: 0,
          narration: "첫 번째 장면",
          duration: 3,
          mediaUrl: "https://example.com/img1.png",
          mediaType: "image",
          audioUrl: "https://example.com/audio1.mp3",
          subtitleStyle: DEFAULT_SUBTITLE_STYLE,
          transitionType: "cut",
          transitionDuration: 0,
        },
        {
          sceneIndex: 1,
          narration: "두 번째 장면",
          duration: 4,
          mediaUrl: "https://example.com/img2.png",
          mediaType: "image",
          audioUrl: "https://example.com/audio2.mp3",
          subtitleStyle: DEFAULT_SUBTITLE_STYLE,
          transitionType: "fade",
          transitionDuration: 0.5,
        },
      ],
      audioTracks: [],
      outputWidth: 1080,
      outputHeight: 1920,
      fps: 30,
    };
    const { filterComplex, outputMaps } = buildFullFilterGraph(request);
    expect(filterComplex).toBeTruthy();
    expect(outputMaps).toContain("[vout]");
    expect(outputMaps).toContain("[aout]");
  });

  it("omits [aout] from outputMaps when no narration and no BGM are present (regression: longform-clip child project export)", () => {
    // Reproduces the Phase 7 hard failure: a freshly-created longform
    // child project has a single scene whose audio lives inside the
    // video file. Before the fix, audioUrl was undefined and
    // audioTracks was empty, but outputMaps still declared `[aout]`,
    // so FFmpeg died with "Stream map '[aout]' matches no streams".
    //
    // After the fix, outputMaps should only contain `[vout]` in that
    // state so the v1 export pipeline succeeds.
    const request: ExportRequest = {
      projectId: "test-id",
      scenes: [
        {
          sceneIndex: 0,
          narration: "longform clip narration (embedded in video)",
          duration: 30,
          mediaUrl: "https://cdn.example/clip.mp4",
          mediaType: "video",
          // audioUrl intentionally omitted
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
    const { outputMaps } = buildFullFilterGraph(request);
    expect(outputMaps).toContain("[vout]");
    expect(outputMaps).not.toContain("[aout]");
  });

  it("still includes [aout] when any scene has audioUrl (e.g. longform-clip with a type='audio' media_asset pointing at the same mp4)", () => {
    // This is the mitigation path: create-child-project.ts inserts a
    // matching type='audio' media_asset whose url is the same clip
    // mp4. export-video.ts turns that into a scene.audioUrl, which
    // flows back through here and reinstates `[aout]`. End-to-end
    // this means the exported short carries the clip's original
    // voice/music.
    const request: ExportRequest = {
      projectId: "test-id",
      scenes: [
        {
          sceneIndex: 0,
          narration: "longform clip",
          duration: 30,
          mediaUrl: "https://cdn.example/clip.mp4",
          mediaType: "video",
          audioUrl: "https://cdn.example/clip.mp4",
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
    const { outputMaps, filterComplex } = buildFullFilterGraph(request);
    expect(outputMaps).toContain("[vout]");
    expect(outputMaps).toContain("[aout]");
    expect(filterComplex).toContain("[aout]");
  });
});
