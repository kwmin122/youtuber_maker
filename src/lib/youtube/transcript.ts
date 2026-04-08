import { YoutubeTranscript } from "youtube-transcript";

export type TranscriptSegment = {
  text: string;
  offset: number;   // ms
  duration: number;  // ms
};

export type TranscriptResult = {
  segments: TranscriptSegment[];
  fullText: string;
  language: string;
  source: "youtube-transcript" | "google-stt";
};

/**
 * Fetch transcript for a YouTube video.
 * Language priority (D-08): ko -> en -> any available -> auto-generated.
 * Returns null if no transcript is available.
 */
export async function fetchTranscript(
  videoId: string
): Promise<TranscriptResult | null> {
  // Try languages in priority order (D-08)
  const languagePriority = ["ko", "en"];

  for (const lang of languagePriority) {
    try {
      const items = await YoutubeTranscript.fetchTranscript(videoId, {
        lang,
      });

      if (items && items.length > 0) {
        const segments: TranscriptSegment[] = items.map((item) => ({
          text: item.text,
          offset: Math.round(item.offset),
          duration: Math.round(item.duration),
        }));

        const fullText = segments.map((s) => s.text).join(" ");

        return {
          segments,
          fullText,
          language: lang,
          source: "youtube-transcript",
        };
      }
    } catch {
      // Language not available, try next
      continue;
    }
  }

  // Try without specifying language (gets auto-generated or first available)
  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId);

    if (items && items.length > 0) {
      const segments: TranscriptSegment[] = items.map((item) => ({
        text: item.text,
        offset: Math.round(item.offset),
        duration: Math.round(item.duration),
      }));

      const fullText = segments.map((s) => s.text).join(" ");

      return {
        segments,
        fullText,
        language: "auto",
        source: "youtube-transcript",
      };
    }
  } catch {
    // No transcript available at all
  }

  return null;
}

/**
 * Google STT fallback (D-09).
 * Placeholder for Phase 2 -- requires audio download + Google Cloud Speech-to-Text.
 * Will be called by the BullMQ worker when youtube-transcript fails.
 * Requires user's Google Cloud API key from api_keys table.
 */
export async function fetchTranscriptViaStt(
  _videoId: string,
  _googleApiKey: string
): Promise<TranscriptResult | null> {
  // TODO: Implement in transcript-collect handler
  // 1. Download audio via yt-dlp or similar
  // 2. Send to Google Cloud Speech-to-Text API
  // 3. Convert response to TranscriptSegment[]
  // This is intentionally deferred to the BullMQ handler (D-09)
  // because audio download is a long-running operation.
  return null;
}
