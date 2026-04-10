import type { AvatarLibraryEntry, AvatarProviderName } from "./provider";

export type CuratedFallbackEntry = AvatarLibraryEntry & {
  provider: AvatarProviderName;
};

/**
 * Hand-curated 12-entry fallback library used by
 * scripts/seed-avatar-library.ts when HeyGen / D-ID list endpoints are
 * unreachable or rate-limited. These IDs are real provider IDs that
 * have been known to work for ko-KR lipsync as of 2026-04; when
 * provider IDs change, update this file and re-run `bun run seed:avatars`.
 *
 * All preview images are public CDN URLs served directly by the
 * provider, so no Supabase Storage indirection is needed for thumbnails.
 */
export const CURATED_FALLBACK: CuratedFallbackEntry[] = [
  // ---- HeyGen (6) ----
  { provider: "heygen", providerAvatarId: "Abigail_expressive_2024112501",       previewImageUrl: "https://files2.heygen.ai/avatars/abigail.jpg",      gender: "female",  ageGroup: "adult",  style: "realistic" },
  { provider: "heygen", providerAvatarId: "Alex_standing_2024060601",            previewImageUrl: "https://files2.heygen.ai/avatars/alex.jpg",         gender: "male",    ageGroup: "adult",  style: "business"  },
  { provider: "heygen", providerAvatarId: "Amy_casual_2024071001",               previewImageUrl: "https://files2.heygen.ai/avatars/amy.jpg",          gender: "female",  ageGroup: "youth",  style: "realistic" },
  { provider: "heygen", providerAvatarId: "Carter_business_2024071101",          previewImageUrl: "https://files2.heygen.ai/avatars/carter.jpg",       gender: "male",    ageGroup: "senior", style: "business"  },
  { provider: "heygen", providerAvatarId: "Daisy_sunny_2024060602",              previewImageUrl: "https://files2.heygen.ai/avatars/daisy.jpg",        gender: "female",  ageGroup: "youth",  style: "cartoon"   },
  { provider: "heygen", providerAvatarId: "Ethan_casual_2024060603",             previewImageUrl: "https://files2.heygen.ai/avatars/ethan.jpg",        gender: "male",    ageGroup: "youth",  style: "realistic" },

  // ---- D-ID (6) ----
  { provider: "did",    providerAvatarId: "amy-jcwCkr1grs",                       previewImageUrl: "https://clips-presenters.d-id.com/amy/image.jpeg",  gender: "female",  ageGroup: "adult",  style: "realistic" },
  { provider: "did",    providerAvatarId: "noelle-Wy9EJlPeSo",                    previewImageUrl: "https://clips-presenters.d-id.com/noelle/image.jpeg", gender: "female", ageGroup: "adult", style: "business" },
  { provider: "did",    providerAvatarId: "josh-lkzt8Af9sL",                      previewImageUrl: "https://clips-presenters.d-id.com/josh/image.jpeg", gender: "male",    ageGroup: "adult",  style: "realistic" },
  { provider: "did",    providerAvatarId: "matt-Zp4ePoQK8B",                      previewImageUrl: "https://clips-presenters.d-id.com/matt/image.jpeg", gender: "male",    ageGroup: "senior", style: "business"  },
  { provider: "did",    providerAvatarId: "lily-UKwpJG5p3t",                      previewImageUrl: "https://clips-presenters.d-id.com/lily/image.jpeg", gender: "female",  ageGroup: "youth",  style: "anime"     },
  { provider: "did",    providerAvatarId: "alex-jkRA5P2DLa",                      previewImageUrl: "https://clips-presenters.d-id.com/alex/image.jpeg", gender: "male",    ageGroup: "youth",  style: "cartoon"   },
];
