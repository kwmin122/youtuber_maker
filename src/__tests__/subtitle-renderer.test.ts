import { describe, it, expect } from "vitest";
import {
  generateSubtitleOverlays,
  generateASSFile,
  formatASSTimestamp,
  hexToASSColor,
} from "@/lib/video/subtitle-renderer";
import { DEFAULT_SUBTITLE_STYLE } from "@/lib/video/types";
import type { ExportScene } from "@/lib/video/types";

describe("formatASSTimestamp", () => {
  it("formats 0 seconds", () => {
    expect(formatASSTimestamp(0)).toBe("0:00:00.00");
  });

  it("formats 65.5 seconds", () => {
    expect(formatASSTimestamp(65.5)).toBe("0:01:05.50");
  });

  it("formats 3661.25 seconds", () => {
    expect(formatASSTimestamp(3661.25)).toBe("1:01:01.25");
  });
});

describe("hexToASSColor", () => {
  it("converts #FFFFFF to ASS format", () => {
    expect(hexToASSColor("#FFFFFF")).toBe("&H00FFFFFF");
  });

  it("converts #FF0000 (red) to ASS BGR format", () => {
    expect(hexToASSColor("#FF0000")).toBe("&H000000FF");
  });

  it("handles alpha channel", () => {
    expect(hexToASSColor("#00000080")).toBe("&H80000000");
  });
});

describe("generateSubtitleOverlays", () => {
  it("generates overlays with cumulative timing", () => {
    const scenes: ExportScene[] = [
      {
        sceneIndex: 0, narration: "첫 번째", duration: 3, mediaUrl: "", mediaType: "image",
        subtitleStyle: DEFAULT_SUBTITLE_STYLE, transitionType: "cut", transitionDuration: 0,
      },
      {
        sceneIndex: 1, narration: "두 번째", duration: 4, mediaUrl: "", mediaType: "image",
        subtitleStyle: DEFAULT_SUBTITLE_STYLE, transitionType: "cut", transitionDuration: 0,
      },
    ];
    const overlays = generateSubtitleOverlays(scenes);
    expect(overlays).toHaveLength(2);
    expect(overlays[0].startTime).toBe(0);
    expect(overlays[0].endTime).toBe(3);
    expect(overlays[1].startTime).toBe(3);
    expect(overlays[1].endTime).toBe(7);
  });

  it("skips scenes without subtitle style", () => {
    const scenes: ExportScene[] = [
      {
        sceneIndex: 0, narration: "자막 있음", duration: 3, mediaUrl: "", mediaType: "image",
        subtitleStyle: DEFAULT_SUBTITLE_STYLE, transitionType: "cut", transitionDuration: 0,
      },
      {
        sceneIndex: 1, narration: "자막 없음", duration: 4, mediaUrl: "", mediaType: "image",
        subtitleStyle: null, transitionType: "cut", transitionDuration: 0,
      },
    ];
    const overlays = generateSubtitleOverlays(scenes);
    expect(overlays).toHaveLength(1);
  });
});

describe("generateASSFile", () => {
  it("produces valid ASS header and dialogue", () => {
    const overlays = [
      { text: "안녕하세요", startTime: 0, endTime: 3, style: DEFAULT_SUBTITLE_STYLE },
    ];
    const ass = generateASSFile(overlays, 1080, 1920);
    expect(ass).toContain("[Script Info]");
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("[V4+ Styles]");
    expect(ass).toContain("[Events]");
    expect(ass).toContain("안녕하세요");
  });
});
