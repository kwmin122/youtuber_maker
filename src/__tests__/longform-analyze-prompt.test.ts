import { describe, it, expect } from "vitest";
import {
  LONGFORM_SYSTEM_INSTRUCTION,
  buildTranscriptPrompt,
  buildAudioPrompt,
} from "@/lib/longform/analyze-prompt";

describe("longform analyze prompt", () => {
  describe("LONGFORM_SYSTEM_INSTRUCTION", () => {
    it("documents all four scoring dimensions", () => {
      expect(LONGFORM_SYSTEM_INSTRUCTION).toContain("hookScore");
      expect(LONGFORM_SYSTEM_INSTRUCTION).toContain("emotionalScore");
      expect(LONGFORM_SYSTEM_INSTRUCTION).toContain("informationDensity");
      expect(LONGFORM_SYSTEM_INSTRUCTION).toContain("trendScore");
    });

    it("enforces 30-60 second clips", () => {
      expect(LONGFORM_SYSTEM_INSTRUCTION).toContain("30000ms");
      expect(LONGFORM_SYSTEM_INSTRUCTION).toContain("60000ms");
    });

    it("specifies the JSON response schema", () => {
      expect(LONGFORM_SYSTEM_INSTRUCTION).toContain("\"candidates\"");
      expect(LONGFORM_SYSTEM_INSTRUCTION).toContain("startMs");
      expect(LONGFORM_SYSTEM_INSTRUCTION).toContain("endMs");
      expect(LONGFORM_SYSTEM_INSTRUCTION).toContain("titleSuggestion");
      expect(LONGFORM_SYSTEM_INSTRUCTION).toContain("transcriptSnippet");
    });
  });

  describe("buildTranscriptPrompt", () => {
    const baseTranscript = [
      { text: "Hello world", offset: 0, duration: 2000 },
      { text: "Second line", offset: 65_000, duration: 3000 },
    ];

    it("includes source metadata and target count", () => {
      const prompt = buildTranscriptPrompt({
        title: "Amazing Video",
        durationSeconds: 1200,
        targetCount: 8,
        transcript: baseTranscript,
      });
      expect(prompt).toContain("Amazing Video");
      expect(prompt).toContain("1200s");
      expect(prompt).toContain("exactly 8");
      expect(prompt).toContain("Return JSON only");
    });

    it("formats timestamps as mm:ss", () => {
      const prompt = buildTranscriptPrompt({
        title: "t",
        durationSeconds: 200,
        targetCount: 5,
        transcript: baseTranscript,
      });
      expect(prompt).toContain("[0:00]");
      expect(prompt).toContain("[1:05]");
      expect(prompt).toContain("Hello world");
      expect(prompt).toContain("Second line");
    });

    it("handles null title", () => {
      const prompt = buildTranscriptPrompt({
        title: null,
        durationSeconds: 100,
        targetCount: 5,
        transcript: [],
      });
      expect(prompt).toContain("(unknown)");
    });

    it("forbids overlapping segments", () => {
      const prompt = buildTranscriptPrompt({
        title: "t",
        durationSeconds: 100,
        targetCount: 5,
        transcript: [],
      });
      expect(prompt).toContain("NOT overlap");
    });
  });

  describe("buildAudioPrompt", () => {
    it("includes title, duration, and target count", () => {
      const prompt = buildAudioPrompt({
        title: "Podcast Ep 1",
        durationSeconds: 3600,
        targetCount: 10,
      });
      expect(prompt).toContain("Podcast Ep 1");
      expect(prompt).toContain("3600s");
      expect(prompt).toContain("exactly 10");
    });

    it("references the attached audio file", () => {
      const prompt = buildAudioPrompt({
        title: null,
        durationSeconds: 500,
        targetCount: 8,
      });
      expect(prompt).toContain("audio file");
      expect(prompt).toContain("(unknown)");
    });
  });
});
