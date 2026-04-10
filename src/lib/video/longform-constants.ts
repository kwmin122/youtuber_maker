/**
 * Phase 7 longform-to-shorts constants.
 *
 * Single source of truth for duration bounds, file-size caps,
 * allowed MIME types, and the Supabase Storage bucket name used
 * by both the API routes and the worker handlers.
 */
export const LONGFORM_MIN_DURATION_SECONDS = 120; // 2 minutes (D-03)
export const LONGFORM_MAX_DURATION_SECONDS = 14400; // 4 hours (D-03)
export const LONGFORM_MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB (D-02)

export const LONGFORM_ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
] as const;

export type LongformAllowedMimeType =
  (typeof LONGFORM_ALLOWED_MIME_TYPES)[number];

export const LONGFORM_BUCKET = "longform-sources";

/**
 * Throw if `durationSeconds` is outside the allowed range.
 * Used by both the yt-dlp probe path and the file-upload ffprobe path.
 */
export function assertDurationInBounds(durationSeconds: number): void {
  if (!Number.isFinite(durationSeconds)) {
    throw new Error(
      `Invalid duration: ${durationSeconds} (must be a finite number)`
    );
  }
  if (durationSeconds < LONGFORM_MIN_DURATION_SECONDS) {
    throw new Error(
      `Video too short: ${durationSeconds}s (minimum ${LONGFORM_MIN_DURATION_SECONDS}s)`
    );
  }
  if (durationSeconds > LONGFORM_MAX_DURATION_SECONDS) {
    throw new Error(
      `Video too long: ${durationSeconds}s (maximum ${LONGFORM_MAX_DURATION_SECONDS}s)`
    );
  }
}
