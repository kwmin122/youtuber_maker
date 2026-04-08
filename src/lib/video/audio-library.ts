import type { AudioLibraryEntry } from "./types";

/**
 * Built-in royalty-free audio library.
 * These are placeholder entries -- in production, replace URLs with actual
 * royalty-free audio files hosted in Supabase Storage or a CDN.
 *
 * Categories:
 * BGM: lo-fi, upbeat, dramatic, calm, cinematic
 * SFX: whoosh, pop, ding, transition, notification
 */
export const AUDIO_LIBRARY: AudioLibraryEntry[] = [
  // --- BGM ---
  {
    id: "bgm-lofi-01",
    name: "Lo-Fi Study Beats",
    type: "bgm",
    url: "/audio/library/bgm-lofi-01.mp3",
    duration: 60,
    category: "lo-fi",
  },
  {
    id: "bgm-upbeat-01",
    name: "Upbeat Energy",
    type: "bgm",
    url: "/audio/library/bgm-upbeat-01.mp3",
    duration: 45,
    category: "upbeat",
  },
  {
    id: "bgm-dramatic-01",
    name: "Dramatic Tension",
    type: "bgm",
    url: "/audio/library/bgm-dramatic-01.mp3",
    duration: 50,
    category: "dramatic",
  },
  {
    id: "bgm-calm-01",
    name: "Calm & Peaceful",
    type: "bgm",
    url: "/audio/library/bgm-calm-01.mp3",
    duration: 55,
    category: "calm",
  },
  {
    id: "bgm-cinematic-01",
    name: "Cinematic Opener",
    type: "bgm",
    url: "/audio/library/bgm-cinematic-01.mp3",
    duration: 30,
    category: "cinematic",
  },
  // --- SFX ---
  {
    id: "sfx-whoosh-01",
    name: "Whoosh",
    type: "sfx",
    url: "/audio/library/sfx-whoosh-01.mp3",
    duration: 1,
    category: "whoosh",
  },
  {
    id: "sfx-pop-01",
    name: "Pop",
    type: "sfx",
    url: "/audio/library/sfx-pop-01.mp3",
    duration: 0.5,
    category: "pop",
  },
  {
    id: "sfx-ding-01",
    name: "Ding Notification",
    type: "sfx",
    url: "/audio/library/sfx-ding-01.mp3",
    duration: 1.5,
    category: "ding",
  },
  {
    id: "sfx-transition-01",
    name: "Scene Transition",
    type: "sfx",
    url: "/audio/library/sfx-transition-01.mp3",
    duration: 1,
    category: "transition",
  },
  {
    id: "sfx-notification-01",
    name: "Notification Bell",
    type: "sfx",
    url: "/audio/library/sfx-notification-01.mp3",
    duration: 1,
    category: "notification",
  },
];

/** Get library entries filtered by type */
export function getAudioLibrary(type?: "bgm" | "sfx"): AudioLibraryEntry[] {
  if (!type) return AUDIO_LIBRARY;
  return AUDIO_LIBRARY.filter((entry) => entry.type === type);
}

/** Find a library entry by ID */
export function findAudioById(id: string): AudioLibraryEntry | undefined {
  return AUDIO_LIBRARY.find((entry) => entry.id === id);
}
