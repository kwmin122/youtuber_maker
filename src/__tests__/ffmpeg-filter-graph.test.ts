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
});
