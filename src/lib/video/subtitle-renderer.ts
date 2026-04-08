import type { ExportScene, SubtitleStyle } from "./types";

/** A subtitle overlay with timing information */
export interface SubtitleOverlay {
  text: string;           // narration text
  startTime: number;      // seconds (cumulative from scene start)
  endTime: number;        // seconds (startTime + duration)
  style: SubtitleStyle;
}

/**
 * Generate subtitle overlays from scenes with cumulative timing.
 * Skips scenes without subtitleStyle.
 */
export function generateSubtitleOverlays(
  scenes: ExportScene[]
): SubtitleOverlay[] {
  const overlays: SubtitleOverlay[] = [];
  let cumulativeTime = 0;

  for (const scene of scenes) {
    if (scene.subtitleStyle) {
      overlays.push({
        text: scene.narration,
        startTime: cumulativeTime,
        endTime: cumulativeTime + scene.duration,
        style: scene.subtitleStyle,
      });
    }

    // Accumulate time, accounting for transition overlap
    if (scene.transitionType !== "cut" && scene.transitionDuration > 0) {
      cumulativeTime += scene.duration - scene.transitionDuration;
    } else {
      cumulativeTime += scene.duration;
    }
  }

  return overlays;
}

/**
 * Generate an ASS (Advanced SubStation Alpha) subtitle file as a string.
 * Maps SubtitleStyle properties to ASS style fields.
 */
export function generateASSFile(
  overlays: SubtitleOverlay[],
  width: number,
  height: number
): string {
  if (overlays.length === 0) return "";

  // Use the first overlay's style as the default style
  const defaultStyle = overlays[0].style;

  const lines: string[] = [];

  // Script Info section
  lines.push("[Script Info]");
  lines.push("Title: YouTuber Min Export Subtitles");
  lines.push("ScriptType: v4.00+");
  lines.push(`PlayResX: ${width}`);
  lines.push(`PlayResY: ${height}`);
  lines.push("WrapStyle: 0");
  lines.push("ScaledBorderAndShadow: yes");
  lines.push("");

  // V4+ Styles section
  lines.push("[V4+ Styles]");
  lines.push(
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"
  );

  // Create a default style entry
  const primaryColor = hexToASSColor(defaultStyle.fontColor);
  const outlineColor = hexToASSColor(defaultStyle.borderColor);
  const backColor = hexToASSColor(defaultStyle.backgroundColor);
  const shadowColor = hexToASSColor(defaultStyle.shadowColor);

  // Alignment mapping: bottom=2, center=5, top=8
  const alignment = mapPositionToAlignment(defaultStyle.position);

  lines.push(
    `Style: Default,${defaultStyle.fontFamily},${defaultStyle.fontSize},${primaryColor},&H00FFFFFF,${outlineColor},${backColor},0,0,0,0,100,100,0,0,1,${defaultStyle.borderWidth},${defaultStyle.shadowOffset},${alignment},20,20,50,1`
  );
  lines.push("");

  // Events section
  lines.push("[Events]");
  lines.push("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text");

  for (const overlay of overlays) {
    const start = formatASSTimestamp(overlay.startTime);
    const end = formatASSTimestamp(overlay.endTime);
    // Escape special ASS characters in text
    const text = overlay.text.replace(/\n/g, "\\N");
    lines.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`);
  }

  return lines.join("\n") + "\n";
}

/**
 * Convert seconds to ASS timestamp format: H:MM:SS.CC (centiseconds).
 */
export function formatASSTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);

  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/**
 * Convert CSS hex color (#RRGGBB or #RRGGBBAA) to ASS color format (&HAABBGGRR).
 */
export function hexToASSColor(hex: string): string {
  // Remove # prefix
  const clean = hex.replace("#", "");

  let r: string, g: string, b: string, a: string;

  if (clean.length === 8) {
    // #RRGGBBAA
    r = clean.substring(0, 2);
    g = clean.substring(2, 4);
    b = clean.substring(4, 6);
    a = clean.substring(6, 8);
  } else if (clean.length === 6) {
    // #RRGGBB (fully opaque)
    r = clean.substring(0, 2);
    g = clean.substring(2, 4);
    b = clean.substring(4, 6);
    a = "00";
  } else {
    // Fallback
    return "&H00FFFFFF";
  }

  // ASS format: &HAABBGGRR (alpha, blue, green, red)
  return `&H${a.toUpperCase()}${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}`;
}

/**
 * Map subtitle position to ASS alignment number.
 * ASS alignment: 1-3 (bottom), 4-6 (center), 7-9 (top), centered variants at 2/5/8.
 */
function mapPositionToAlignment(position: "top" | "center" | "bottom"): number {
  switch (position) {
    case "top":
      return 8;
    case "center":
      return 5;
    case "bottom":
    default:
      return 2;
  }
}
