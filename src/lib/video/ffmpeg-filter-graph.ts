import type {
  SceneFilterConfig,
  SubtitleStyle,
  ExportRequest,
} from "./types";

/**
 * Font file lookup map for common Korean/system fonts.
 * Falls back to Noto Sans KR on Linux systems.
 */
const FONT_PATH_MAP: Record<string, string> = {
  "Noto Sans KR": "/usr/share/fonts/truetype/noto/NotoSansKR-Regular.otf",
  "Pretendard": "/usr/share/fonts/truetype/pretendard/Pretendard-Regular.otf",
  "Arial": "/usr/share/fonts/truetype/msttcorefonts/Arial.ttf",
  "default": "/usr/share/fonts/truetype/noto/NotoSansKR-Regular.otf",
};

/**
 * Escape special characters for FFmpeg drawtext filter.
 * Escapes: backslash, single quote, colon, percent, brackets.
 */
export function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

/**
 * Build per-scene video filters: loop/trim + scale + pad.
 * Labels each scene output as [v0], [v1], etc.
 */
export function buildSceneFilters(
  scenes: SceneFilterConfig[],
  width: number,
  height: number
): string {
  const filters: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const idx = scene.inputIndex;

    // For image inputs: loop to create video from still, then trim to duration
    // For video inputs: trim to duration
    // Both get scaled and padded to target resolution
    const trimFilter = `[${idx}:v]trim=0:${scene.duration},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[v${i}]`;
    filters.push(trimFilter);
  }

  return filters.join(";");
}

/**
 * Build transition filters between consecutive scenes.
 * Uses xfade for transitions, concat for cut-only.
 * Output label: [vout].
 */
export function buildTransitionFilters(scenes: SceneFilterConfig[]): string {
  if (scenes.length === 0) return "";
  if (scenes.length === 1) return `[v0]copy[vout]`;

  // Check if ALL transitions are "cut"
  const allCuts = scenes.every((s) => s.transitionType === "cut");

  if (allCuts) {
    // Simple concat for all-cut scenarios
    const labels = scenes.map((_, i) => `[v${i}]`).join("");
    return `${labels}concat=n=${scenes.length}:v=1:a=0[vout]`;
  }

  // Build xfade chain for transitions
  const filters: string[] = [];
  let currentLabel = "[v0]";
  let cumulativeOffset = scenes[0].duration;

  for (let i = 1; i < scenes.length; i++) {
    const scene = scenes[i];
    const outputLabel = i === scenes.length - 1 ? "[vout]" : `[vt${i}]`;

    if (scene.transitionType === "cut") {
      // Concat this pair
      filters.push(
        `${currentLabel}[v${i}]concat=n=2:v=1:a=0${outputLabel}`
      );
    } else {
      // Map transition types to FFmpeg xfade names
      const xfadeName = mapTransitionToXfade(scene.transitionType);
      const offset = cumulativeOffset - scene.transitionDuration;

      filters.push(
        `${currentLabel}[v${i}]xfade=transition=${xfadeName}:duration=${scene.transitionDuration}:offset=${offset}${outputLabel}`
      );
    }

    currentLabel = outputLabel;

    // Accumulate offset: add this scene's duration, minus transition overlap
    if (scene.transitionType !== "cut") {
      cumulativeOffset += scene.duration - scene.transitionDuration;
    } else {
      cumulativeOffset += scene.duration;
    }
  }

  return filters.join(";");
}

/**
 * Build drawtext filter string for subtitle overlay on a scene.
 */
export function buildSubtitleFilter(
  text: string,
  style: SubtitleStyle,
  duration: number
): string {
  const fontPath = FONT_PATH_MAP[style.fontFamily] || FONT_PATH_MAP["default"];
  const escapedText = escapeFFmpegText(text);

  // Position mapping
  let yExpr: string;
  switch (style.position) {
    case "top":
      yExpr = "y=h*0.1";
      break;
    case "center":
      yExpr = "y=(h-text_h)/2";
      break;
    case "bottom":
    default:
      yExpr = "y=h*0.85";
      break;
  }

  // Build drawtext filter
  const parts: string[] = [
    `drawtext=text='${escapedText}'`,
    `fontfile='${fontPath}'`,
    `fontsize=${style.fontSize}`,
    `fontcolor=${style.fontColor}`,
    `borderw=${style.borderWidth}`,
    `bordercolor=${style.borderColor}`,
    `shadowcolor=${style.shadowColor}`,
    `shadowx=${style.shadowOffset}`,
    `shadowy=${style.shadowOffset}`,
    `x=(w-text_w)/2`,
    yExpr,
  ];

  // Add box background if not transparent
  if (style.backgroundColor !== "transparent") {
    parts.push(`box=1`);
    parts.push(`boxcolor=${style.backgroundColor}`);
    parts.push(`boxborderw=8`);
  }

  return parts.join(":");
}

/**
 * Build audio mix filter: concat narration tracks + mix with BGM.
 */
export function buildAudioMixFilter(
  narrationCount: number,
  bgmTracks: { startTime: number; endTime: number | null; volume: number }[],
  totalDuration: number
): string {
  if (narrationCount === 0 && bgmTracks.length === 0) return "";

  const filters: string[] = [];
  let mixInputCount = 0;

  // Concat all narration audio streams
  if (narrationCount > 0) {
    const narrLabels = Array.from(
      { length: narrationCount },
      (_, i) => `[a${i}]`
    ).join("");
    filters.push(`${narrLabels}concat=n=${narrationCount}:v=0:a=1[narr]`);
    mixInputCount++;
  }

  // Process BGM tracks
  const bgmStartIndex = narrationCount;
  bgmTracks.forEach((bgm, i) => {
    const inputIdx = bgmStartIndex + i;
    const endTime = bgm.endTime ?? totalDuration;
    const delayMs = Math.round(bgm.startTime * 1000);

    filters.push(
      `[${inputIdx}:a]atrim=0:${endTime - bgm.startTime},adelay=${delayMs}|${delayMs},volume=${bgm.volume}[bgm${i}]`
    );
    mixInputCount++;
  });

  // Mix all audio streams
  if (mixInputCount > 1) {
    const mixLabels: string[] = [];
    if (narrationCount > 0) mixLabels.push("[narr]");
    bgmTracks.forEach((_, i) => mixLabels.push(`[bgm${i}]`));
    filters.push(
      `${mixLabels.join("")}amix=inputs=${mixInputCount}:duration=first[aout]`
    );
  } else if (narrationCount > 0) {
    // Only narration, rename label
    filters.push(`[narr]acopy[aout]`);
  } else if (bgmTracks.length === 1) {
    // Only one BGM track, rename
    filters.push(`[bgm0]acopy[aout]`);
  }

  return filters.join(";");
}

/**
 * Build complete FFmpeg filter_complex from an ExportRequest.
 * Returns the filter_complex string and -map arguments.
 */
export function buildFullFilterGraph(request: ExportRequest): {
  filterComplex: string;
  outputMaps: string[];
} {
  const { scenes, audioTracks, outputWidth, outputHeight } = request;

  // Build scene filter configs
  const sceneConfigs: SceneFilterConfig[] = scenes.map((scene, i) => ({
    inputIndex: i,
    duration: scene.duration,
    hasSubtitle: scene.subtitleStyle !== null,
    subtitleText: scene.narration,
    subtitleStyle: scene.subtitleStyle ?? undefined,
    transitionType: scene.transitionType,
    transitionDuration: scene.transitionDuration,
  }));

  const filterParts: string[] = [];

  // 1. Scene video filters (scale + pad)
  const sceneFilters = buildSceneFilters(sceneConfigs, outputWidth, outputHeight);
  if (sceneFilters) filterParts.push(sceneFilters);

  // 2. Transition filters
  const transitionFilters = buildTransitionFilters(sceneConfigs);
  if (transitionFilters) filterParts.push(transitionFilters);

  // 3. Audio mix filter
  const narrCount = scenes.filter((s) => s.audioUrl).length;
  const bgmConfigs = audioTracks.map((t) => ({
    startTime: t.startTime,
    endTime: t.endTime,
    volume: t.volume,
  }));
  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  const audioFilter = buildAudioMixFilter(narrCount, bgmConfigs, totalDuration);
  if (audioFilter) filterParts.push(audioFilter);

  return {
    filterComplex: filterParts.join(";"),
    outputMaps: ["[vout]", "[aout]"],
  };
}

/**
 * Map our transition type names to FFmpeg xfade transition names.
 */
function mapTransitionToXfade(
  type: string
): string {
  switch (type) {
    case "fade":
      return "fade";
    case "dissolve":
      return "dissolve";
    case "slide-left":
      return "slideleft";
    case "slide-right":
      return "slideright";
    case "zoom-in":
      return "zoomin";
    default:
      return "fade";
  }
}
