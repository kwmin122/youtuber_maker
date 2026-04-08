import { describe, it, expect } from "vitest";
import {
  getAvailableVoices,
  VOICE_GENDER,
  type TTSVoice,
} from "@/lib/media/tts";

describe("TTS module", () => {
  describe("getAvailableVoices", () => {
    it("returns 6 voices", () => {
      const voices = getAvailableVoices();
      expect(voices).toHaveLength(6);
    });

    it("includes both male and female voices", () => {
      const voices = getAvailableVoices();
      const genders = voices.map((v) => v.gender);
      expect(genders).toContain("male");
      expect(genders).toContain("female");
    });

    it("has Korean descriptions", () => {
      const voices = getAvailableVoices();
      for (const voice of voices) {
        // Korean text contains Hangul characters
        expect(voice.description).toMatch(/[\uAC00-\uD7AF]/);
      }
    });

    it("all voice IDs are valid TTSVoice values", () => {
      const voices = getAvailableVoices();
      const validIds: TTSVoice[] = [
        "alloy",
        "echo",
        "fable",
        "onyx",
        "nova",
        "shimmer",
      ];
      for (const voice of voices) {
        expect(validIds).toContain(voice.id);
      }
    });
  });

  describe("VOICE_GENDER", () => {
    it("maps all 6 voices to genders", () => {
      expect(Object.keys(VOICE_GENDER)).toHaveLength(6);
    });

    it("nova and shimmer are female", () => {
      expect(VOICE_GENDER.nova).toBe("female");
      expect(VOICE_GENDER.shimmer).toBe("female");
    });

    it("echo, fable, onyx are male", () => {
      expect(VOICE_GENDER.echo).toBe("male");
      expect(VOICE_GENDER.fable).toBe("male");
      expect(VOICE_GENDER.onyx).toBe("male");
    });

    it("alloy is neutral", () => {
      expect(VOICE_GENDER.alloy).toBe("neutral");
    });
  });

  describe("generateTTS", () => {
    it("exports generateTTS function", async () => {
      const mod = await import("@/lib/media/tts");
      expect(typeof mod.generateTTS).toBe("function");
    });
  });
});
