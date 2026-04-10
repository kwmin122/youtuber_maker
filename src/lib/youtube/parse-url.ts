export type ParsedChannelUrl =
  | { type: "channel_id"; value: string }
  | { type: "handle"; value: string }
  | { type: "custom"; value: string }
  | null;

/**
 * Parse a YouTube channel URL and extract the identifier.
 * Supports:
 *   - https://www.youtube.com/@handle
 *   - https://youtube.com/channel/UCxxxxxxxxxxxx
 *   - https://www.youtube.com/c/customname
 *   - @handle (bare handle)
 *   - UCxxxxxxxxxxxx (bare channel ID)
 */
export function parseChannelUrl(input: string): ParsedChannelUrl {
  const trimmed = input.trim();

  // Bare handle: @handle
  if (/^@[\w.-]+$/.test(trimmed)) {
    return { type: "handle", value: trimmed.slice(1) };
  }

  // Bare channel ID: UC followed by 22 chars
  if (/^UC[\w-]{22}$/.test(trimmed)) {
    return { type: "channel_id", value: trimmed };
  }

  // Try parsing as URL
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  // Must be a YouTube domain
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host !== "youtube.com" && host !== "youtu.be") {
    return null;
  }

  const pathParts = url.pathname
    .split("/")
    .filter((p) => p.length > 0);

  if (pathParts.length === 0) return null;

  // /@handle
  if (pathParts[0].startsWith("@")) {
    return { type: "handle", value: pathParts[0].slice(1) };
  }

  // /channel/UCxxxxxx
  if (pathParts[0] === "channel" && pathParts[1]) {
    return { type: "channel_id", value: pathParts[1] };
  }

  // /c/customname
  if (pathParts[0] === "c" && pathParts[1]) {
    return { type: "custom", value: pathParts[1] };
  }

  // /user/username (legacy)
  if (pathParts[0] === "user" && pathParts[1]) {
    return { type: "custom", value: pathParts[1] };
  }

  return null;
}

/**
 * Parse a YouTube video URL (or bare 11-char video id) and extract the
 * video id. Accepts watch URLs, youtu.be short links, /shorts/ URLs,
 * mobile URLs, and bare ids. Returns null for anything else.
 */
export function parseVideoUrl(
  input: string
): { videoId: string } | null {
  const trimmed = input.trim();

  // bare ID
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return { videoId: trimmed };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && /^[A-Za-z0-9_-]{11}$/.test(id)
      ? { videoId: id }
      : null;
  }

  if (host === "youtube.com") {
    const vParam = url.searchParams.get("v");
    if (vParam && /^[A-Za-z0-9_-]{11}$/.test(vParam)) {
      return { videoId: vParam };
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      parts[0] === "shorts" &&
      parts[1] &&
      /^[A-Za-z0-9_-]{11}$/.test(parts[1])
    ) {
      return { videoId: parts[1] };
    }
  }

  return null;
}
