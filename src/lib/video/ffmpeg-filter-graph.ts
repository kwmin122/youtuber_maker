import type {
  SceneFilterConfig,
  SubtitleStyle,
  ExportRequest,
  AvatarLayout,
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
 *
 * @param labelOverrides - Optional map from scene index to the label
 *   that should be consumed instead of the default `v${i}`. Used by
 *   Phase 8 avatar overlay: scenes with an avatar get their base label
 *   replaced by the overlay output (e.g. `v0o`). Defaults to `{}` so
 *   all existing callers continue to work without changes.
 */
export function buildTransitionFilters(
  scenes: SceneFilterConfig[],
  labelOverrides: Record<number, string> = {}
): string {
  const label = (i: number) => `[${labelOverrides[i] ?? `v${i}`}]`;

  if (scenes.length === 0) return "";
  if (scenes.length === 1) return `${label(0)}copy[vout]`;

  // Check if ALL transitions are "cut"
  const allCuts = scenes.every((s) => s.transitionType === "cut");

  if (allCuts) {
    // Simple concat for all-cut scenarios
    const labels = scenes.map((_, i) => label(i)).join("");
    return `${labels}concat=n=${scenes.length}:v=1:a=0[vout]`;
  }

  // Build xfade chain for transitions
  const filters: string[] = [];
  let currentLabel = label(0);
  let cumulativeOffset = scenes[0].duration;

  for (let i = 1; i < scenes.length; i++) {
    const scene = scenes[i];
    const outputLabel = i === scenes.length - 1 ? "[vout]" : `[vt${i}]`;

    if (scene.transitionType === "cut") {
      // Concat this pair
      filters.push(
        `${currentLabel}${label(i)}concat=n=2:v=1:a=0${outputLabel}`
      );
    } else {
      // Map transition types to FFmpeg xfade names
      const xfadeName = mapTransitionToXfade(scene.transitionType);
      const offset = cumulativeOffset - scene.transitionDuration;

      filters.push(
        `${currentLabel}${label(i)}xfade=transition=${xfadeName}:duration=${scene.transitionDuration}:offset=${offset}${outputLabel}`
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

// ─── Phase 8: Avatar overlay helpers ────────────────────────────────────────

export type AvatarOverlaySpec = {
  /** The FFmpeg input index of this avatar video file. */
  inputIndex: number;
  /** The scene index in the export timeline (0-based). Must match the `[vN]` label produced by buildSceneFilters. */
  sceneIndex: number;
  layout: AvatarLayout;
};

/**
 * Build per-scene overlay filters that composite an avatar lipsync
 * video on top of the base scene video. Inputs:
 *   - the base scene labels `[v0]`, `[v1]`, ... produced by
 *     `buildSceneFilters`
 *   - the avatar input files appended at the end of the ffmpeg input list
 *
 * Outputs: renamed scene labels `[v0o]`, `[v1o]`, ... (only for
 * scenes whose layout.enabled is true). Scenes without an avatar
 * retain their original `[vN]` label. The caller (buildFullFilterGraph)
 * must then pass the labelOverrides map into buildTransitionFilters.
 *
 * Phase 8 D-08.
 */
export function buildAvatarOverlayFilters(
  specs: AvatarOverlaySpec[],
  outputWidth: number,
  outputHeight: number
): { filters: string; labelOverrides: Record<number, string> } {
  const out: string[] = [];
  const labelOverrides: Record<number, string> = {};

  for (const spec of specs) {
    if (!spec.layout.enabled) continue;
    const avLabel = `[av${spec.sceneIndex}]`;
    const outLabel = `[v${spec.sceneIndex}o]`;

    if (spec.layout.position === "fullscreen") {
      // Scale avatar to fill full output dimensions, then overlay at origin
      out.push(
        `[${spec.inputIndex}:v]scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=cover,crop=${outputWidth}:${outputHeight}${avLabel}`
      );
      out.push(`[v${spec.sceneIndex}]${avLabel}overlay=0:0${outLabel}`);
    } else {
      const scale = Math.max(0.1, Math.min(1, spec.layout.scale));
      out.push(`[${spec.inputIndex}:v]scale=iw*${scale}:-1${avLabel}`);

      const pad = Math.max(0, spec.layout.paddingPx);
      let xy: string;
      switch (spec.layout.position) {
        case "bottom-right":
          xy = `W-w-${pad}:H-h-${pad}`;
          break;
        case "bottom-left":
          xy = `${pad}:H-h-${pad}`;
          break;
        case "top-right":
          xy = `W-w-${pad}:${pad}`;
          break;
        case "center":
          xy = `(W-w)/2:(H-h)/2`;
          break;
        default:
          xy = `W-w-${pad}:H-h-${pad}`;
      }
      out.push(`[v${spec.sceneIndex}]${avLabel}overlay=${xy}${outLabel}`);
    }

    labelOverrides[spec.sceneIndex] = `v${spec.sceneIndex}o`;
  }

  return { filters: out.join(";"), labelOverrides };
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
 *
 * IMPORTANT — input indexing contract:
 *   The caller MUST pass `narrationBaseIndex` equal to the FFmpeg
 *   input index (0-based) of the first narration audio file on the
 *   ffmpeg command line, and `bgmBaseIndex` equal to the first BGM
 *   track's input index. This filter then references streams as
 *   `[N:a]` where N is the actual input index, and relabels them to
 *   stable `[a0]`, `[a1]`, ... / `[bgm0]` before concat/mix.
 *
 *   Without this relabeling, the legacy pre-2026-04-10 behavior wrote
 *   `[a0]concat...` directly, but `[a0]` is NOT a valid FFmpeg stream
 *   specifier — it is only a named pad label that must be produced by
 *   an upstream filter node. FFmpeg therefore failed with
 *   "Stream specifier 'a0' matches no streams" (Codex review,
 *   Phase 7 retry 2).
 */
export function buildAudioMixFilter(
  narrationCount: number,
  bgmTracks: { startTime: number; endTime: number | null; volume: number }[],
  totalDuration: number,
  narrationBaseIndex: number = 0,
  bgmBaseIndex: number = narrationCount
): string {
  if (narrationCount === 0 && bgmTracks.length === 0) return "";

  const filters: string[] = [];
  let mixInputCount = 0;

  // Concat all narration audio streams.
  // First relabel each real input stream `[N:a]` to a stable pad
  // `[a0]`, `[a1]`, ... via a no-op `asetpts=PTS-STARTPTS` node. That
  // also resets each narration's PTS so concat doesn't fight over
  // timestamps when narrations were encoded with non-zero starts
  // (common with mp3 gaps).
  if (narrationCount > 0) {
    for (let i = 0; i < narrationCount; i++) {
      const inputIdx = narrationBaseIndex + i;
      filters.push(`[${inputIdx}:a]asetpts=PTS-STARTPTS[a${i}]`);
    }
    const narrLabels = Array.from(
      { length: narrationCount },
      (_, i) => `[a${i}]`
    ).join("");
    filters.push(`${narrLabels}concat=n=${narrationCount}:v=0:a=1[narr]`);
    mixInputCount++;
  }

  // Process BGM tracks
  bgmTracks.forEach((bgm, i) => {
    const inputIdx = bgmBaseIndex + i;
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

  // Build scene filter configs (carry avatar fields through for overlay step)
  const sceneConfigs: SceneFilterConfig[] = scenes.map((scene, i) => ({
    inputIndex: i,
    duration: scene.duration,
    hasSubtitle: scene.subtitleStyle !== null,
    subtitleText: scene.narration,
    subtitleStyle: scene.subtitleStyle ?? undefined,
    transitionType: scene.transitionType,
    transitionDuration: scene.transitionDuration,
    avatarVideoUrl: scene.avatarVideoUrl,
    avatarLayout: scene.avatarLayout,
  }));

  const filterParts: string[] = [];

  // 1. Scene video filters (scale + pad)
  const sceneFilters = buildSceneFilters(sceneConfigs, outputWidth, outputHeight);
  if (sceneFilters) filterParts.push(sceneFilters);

  // 1.5 — Avatar overlay filters (Phase 8, D-08)
  // Avatar video files live AFTER scenes + narrations + BGMs in the ffmpeg
  // input list: [scenes...][narrations...][bgms...][avatars...]
  // We compute the avatar base index here and pass correct input offsets.
  const narrCountForAvatar = scenes.filter((s) => s.audioUrl).length;
  const avatarScenes = sceneConfigs
    .map((s, idx) => ({ scene: s, idx }))
    .filter(({ scene }) => scene.avatarVideoUrl && scene.avatarLayout?.enabled);
  const avatarBaseIndex = scenes.length + narrCountForAvatar + audioTracks.length;
  const avatarSpecs: AvatarOverlaySpec[] = avatarScenes.map(({ scene, idx }, i) => ({
    inputIndex: avatarBaseIndex + i,
    sceneIndex: idx,
    layout: scene.avatarLayout!,
  }));
  const { filters: avatarFilters, labelOverrides } = buildAvatarOverlayFilters(
    avatarSpecs,
    outputWidth,
    outputHeight
  );
  if (avatarFilters) filterParts.push(avatarFilters);

  // 2. Transition filters — pass labelOverrides so avatar-overlaid scenes
  // use their [vNo] labels instead of the raw [vN] labels.
  const transitionFilters = buildTransitionFilters(sceneConfigs, labelOverrides);
  if (transitionFilters) filterParts.push(transitionFilters);

  // 3. Audio mix filter
  //
  // Input index contract (must mirror ffmpeg-export.ts input ordering):
  //   - inputs [0 .. scenes.length - 1]               = scene visuals
  //   - inputs [scenes.length .. scenes.length + N-1] = N narration mp3s
  //       (one per scene WITH audioUrl)
  //   - inputs [scenes.length + N ..]                 = M BGM tracks
  const narrCount = scenes.filter((s) => s.audioUrl).length;
  const narrationBaseIndex = scenes.length;
  const bgmBaseIndex = scenes.length + narrCount;
  const bgmConfigs = audioTracks.map((t) => ({
    startTime: t.startTime,
    endTime: t.endTime,
    volume: t.volume,
  }));
  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  const audioFilter = buildAudioMixFilter(
    narrCount,
    bgmConfigs,
    totalDuration,
    narrationBaseIndex,
    bgmBaseIndex
  );
  if (audioFilter) filterParts.push(audioFilter);

  // Only declare `[aout]` in the output maps when the audio filter
  // actually produced an `[aout]` label. Otherwise FFmpeg dies with
  // "Stream map '[aout]' matches no streams". This matches the
  // behavior of `buildAudioMixFilter` which returns "" when there is
  // no narration and no BGM (e.g. a freshly-created longform child
  // project whose scene has its audio embedded in the video file —
  // see create-child-project.ts for the mitigation that inserts a
  // matching type='audio' media_asset row).
  const outputMaps: string[] = ["[vout]"];
  if (audioFilter) {
    outputMaps.push("[aout]");
  }

  return {
    filterComplex: filterParts.join(";"),
    outputMaps,
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
