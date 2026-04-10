/**
 * Shared abstraction for AI avatar lipsync providers.
 *
 * Both HeyGen and D-ID follow the same submit → poll → download pattern
 * used by Kling, so the worker handler in Plan 08-04 programs against
 * this interface and selects a concrete implementation via the BYOK
 * factory in `provider-factory.ts`. Adding a new provider later (e.g.
 * self-hosted SadTalker) is a one-file change.
 */

export type AvatarProviderName = "heygen" | "did";

export type AvatarLibraryEntry = {
  providerAvatarId: string;
  previewImageUrl: string;
  gender: "male" | "female" | "neutral";
  ageGroup: "youth" | "adult" | "senior";
  style: "realistic" | "cartoon" | "anime" | "business";
  /** Optional provider voice id hint the seed script may persist. */
  voiceIdHint?: string;
};

export type AvatarLipsyncSubmitRequest = {
  /**
   * Either a provider-hosted avatar id (curated library) OR a signed
   * public URL to a user-uploaded reference photo (custom preset).
   * Exactly one of `avatarId` / `referenceImageUrl` must be set.
   */
  avatarId?: string;
  referenceImageUrl?: string;
  /** Publicly reachable audio URL (Supabase signed URL is fine). */
  audioUrl: string;
  /** Width/height hint for the output — providers may ignore. */
  width?: number;
  height?: number;
};

export type AvatarLipsyncTaskStatus =
  | "submitted"
  | "processing"
  | "completed"
  | "failed";

export type AvatarLipsyncTask = {
  taskId: string;
  status: AvatarLipsyncTaskStatus;
  /** Set when status === "completed". Direct download URL. */
  videoUrl?: string;
  errorMessage?: string;
};

export interface AvatarLipsyncProvider {
  readonly name: AvatarProviderName;

  /** Seed-script helper: list provider-hosted avatars for curation. */
  listAvatars(): Promise<AvatarLibraryEntry[]>;

  /** Submit a lipsync job. Returns a provider task id. */
  generateLipsyncJob(req: AvatarLipsyncSubmitRequest): Promise<string>;

  /** Poll provider for task status. */
  pollJobStatus(taskId: string): Promise<AvatarLipsyncTask>;

  /**
   * Convenience polling loop with exponential backoff. Plan 08-04 may
   * either call this or implement its own loop that persists progress
   * updates to the `jobs` row between polls.
   */
  waitForCompletion(
    taskId: string,
    opts?: { maxAttempts?: number; intervalMs?: number }
  ): Promise<AvatarLipsyncTask>;
}
