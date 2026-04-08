import { describe, it, expect } from "vitest";
import {
  buildBenchmarkAnalysisPrompt,
  parseBenchmarkAnalysisResponse,
} from "@/lib/ai/prompts";

describe("buildBenchmarkAnalysisPrompt", () => {
  it("includes channel title in system instruction", () => {
    const { systemInstruction } = buildBenchmarkAnalysisPrompt("TestChannel", [
      { videoTitle: "Test", fullText: "Hello world" },
    ]);
    expect(systemInstruction).toContain("TestChannel");
  });

  it("includes video titles and transcript text in prompt", () => {
    const { userPrompt } = buildBenchmarkAnalysisPrompt("TestChannel", [
      { videoTitle: "Video A", fullText: "Content A" },
      { videoTitle: "Video B", fullText: "Content B" },
    ]);
    expect(userPrompt).toContain("Video A");
    expect(userPrompt).toContain("Video B");
    expect(userPrompt).toContain("Content A");
    expect(userPrompt).toContain("Content B");
  });

  it("truncates long transcripts to 3000 chars", () => {
    const longText = "a".repeat(5000);
    const { userPrompt } = buildBenchmarkAnalysisPrompt("TestChannel", [
      { videoTitle: "Long", fullText: longText },
    ]);
    // The full 5000-char string should not appear
    expect(userPrompt).not.toContain(longText);
    // But a 3000-char prefix should
    expect(userPrompt).toContain("a".repeat(3000));
  });
});

describe("parseBenchmarkAnalysisResponse", () => {
  const validResponse = JSON.stringify({
    toneAnalysis: {
      style: "casual",
      sentenceEndings: ["~요"],
      frequentExpressions: ["진짜"],
      formality: "casual",
      emotionalTone: "energetic",
    },
    hookingPatterns: [
      {
        type: "question",
        description: "Starts with a question",
        example: "혹시 알고 계셨나요?",
        frequency: 60,
      },
    ],
    structurePatterns: [
      {
        name: "problem-solution",
        sections: ["문제", "해결"],
        sectionDurations: [30, 30],
        frequency: 50,
      },
    ],
    topicRecommendations: [
      {
        title: "Test Topic",
        description: "A test topic",
        rationale: "Fits the channel",
        suggestedHookType: "question",
        suggestedStructure: "problem-solution",
        viralPotential: "high",
      },
    ],
  });

  it("parses valid JSON response", () => {
    const result = parseBenchmarkAnalysisResponse(validResponse);
    expect(result.toneAnalysis.style).toBe("casual");
    expect(result.hookingPatterns).toHaveLength(1);
    expect(result.topicRecommendations).toHaveLength(1);
  });

  it("handles markdown-wrapped JSON", () => {
    const wrapped = "```json\n" + validResponse + "\n```";
    const result = parseBenchmarkAnalysisResponse(wrapped);
    expect(result.toneAnalysis.formality).toBe("casual");
  });

  it("throws on missing fields", () => {
    expect(() =>
      parseBenchmarkAnalysisResponse(JSON.stringify({ toneAnalysis: {} }))
    ).toThrow();
  });

  it("throws on invalid JSON", () => {
    expect(() =>
      parseBenchmarkAnalysisResponse("not json at all")
    ).toThrow("Failed to parse");
  });
});
