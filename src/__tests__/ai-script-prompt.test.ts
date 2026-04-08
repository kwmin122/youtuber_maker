import { describe, it, expect } from "vitest";
import {
  buildScriptGenerationPrompt,
  getVariantStrategies,
} from "@/lib/ai/prompts";

describe("buildScriptGenerationPrompt", () => {
  const sampleInput = {
    topicTitle: "테스트 주제",
    topicDescription: "테스트 설명",
    toneAnalysis: {
      style: "캐주얼",
      sentenceEndings: ["~요", "~입니다"],
      frequentExpressions: ["진짜", "대박"],
      formality: "casual" as const,
      emotionalTone: "energetic",
    },
    hookType: "question",
    structureType: "problem-solution",
    variant: "A" as const,
    variantStrategy: "가장 검증된 조합",
  };

  it("includes topic title in prompt", () => {
    const { userPrompt } = buildScriptGenerationPrompt(sampleInput);
    expect(userPrompt).toContain("테스트 주제");
  });

  it("includes tone analysis details", () => {
    const { userPrompt } = buildScriptGenerationPrompt(sampleInput);
    expect(userPrompt).toContain("캐주얼");
    expect(userPrompt).toContain("~요");
    expect(userPrompt).toContain("진짜");
  });

  it("includes variant identifier", () => {
    const { userPrompt } = buildScriptGenerationPrompt(sampleInput);
    expect(userPrompt).toContain("Variant A");
  });

  it("includes 60-second duration rule", () => {
    const { userPrompt } = buildScriptGenerationPrompt(sampleInput);
    expect(userPrompt).toContain("60초");
    expect(userPrompt).toContain("150~200단어");
  });

  it("system instruction specifies Korean and no JSON", () => {
    const { systemInstruction } = buildScriptGenerationPrompt(sampleInput);
    expect(systemInstruction).toContain("Korean");
    expect(systemInstruction).toContain("ONLY the script text");
  });
});

describe("getVariantStrategies", () => {
  it("returns at least 2 variants", () => {
    const strategies = getVariantStrategies(
      [
        { type: "question", description: "질문" },
        { type: "shock-stat", description: "충격 통계" },
      ],
      [
        { name: "problem-solution", sections: ["문제", "해결"] },
        { name: "story-arc", sections: ["도입", "전개", "마무리"] },
      ]
    );
    expect(strategies.length).toBeGreaterThanOrEqual(2);
    expect(strategies[0].variant).toBe("A");
    expect(strategies[1].variant).toBe("B");
  });

  it("returns 3 variants when enough patterns exist", () => {
    const strategies = getVariantStrategies(
      [
        { type: "question", description: "질문" },
        { type: "shock-stat", description: "충격" },
        { type: "story", description: "스토리" },
      ],
      [
        { name: "problem-solution", sections: [] },
        { name: "story-arc", sections: [] },
      ]
    );
    expect(strategies.length).toBe(3);
    expect(strategies[2].variant).toBe("C");
  });

  it("handles empty patterns with defaults", () => {
    const strategies = getVariantStrategies([], []);
    expect(strategies.length).toBeGreaterThanOrEqual(2);
    expect(strategies[0].hookType).toBe("question");
  });

  it("each variant has distinct strategy description", () => {
    const strategies = getVariantStrategies(
      [{ type: "q", description: "q" }],
      [{ name: "ps", sections: [] }]
    );
    const descriptions = strategies.map((s) => s.strategy);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});
