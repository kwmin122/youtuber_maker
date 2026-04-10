import { describe, it, expect, vi } from "vitest";
import type { AIProvider } from "@/lib/ai/types";
import { predictViralScore } from "@/lib/distribution/viral-scorer";
import type { ViralScoreRequest } from "@/lib/distribution/types";

function createMockProvider(response: string): AIProvider {
  return {
    name: "openai",
    generateText: vi.fn().mockResolvedValue(response),
  };
}

const baseRequest: ViralScoreRequest = {
  scriptContent: "Did you know that 90% of people don't know this fact?",
  title: "You Won't Believe This!",
};

const validViralResponse = JSON.stringify({
  score: 72,
  breakdown: {
    hookStrength: 20,
    emotionalTrigger: 18,
    trendFit: 15,
    titleClickability: 19,
  },
  suggestions: [
    "Add a more specific number to the hook",
    "Include a trending hashtag reference",
    "Make the title more curiosity-driven",
  ],
  verdict: "promising",
});

describe("viral-scorer", () => {
  it("returns a valid ViralScoreResult with all fields", async () => {
    const mockProvider = createMockProvider(validViralResponse);
    const result = await predictViralScore({
      provider: mockProvider,
      request: baseRequest,
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.breakdown.hookStrength).toBeDefined();
    expect(result.breakdown.emotionalTrigger).toBeDefined();
    expect(result.breakdown.trendFit).toBeDefined();
    expect(result.breakdown.titleClickability).toBeDefined();
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(["viral", "promising", "average", "weak"]).toContain(result.verdict);
  });

  it("clamps each dimension score to 0-25", async () => {
    const response = JSON.stringify({
      score: 100,
      breakdown: {
        hookStrength: 30, // > 25, should be clamped
        emotionalTrigger: -5, // < 0, should be clamped
        trendFit: 25,
        titleClickability: 25,
      },
      suggestions: ["test"],
      verdict: "viral",
    });
    const mockProvider = createMockProvider(response);
    const result = await predictViralScore({
      provider: mockProvider,
      request: baseRequest,
    });

    expect(result.breakdown.hookStrength).toBeLessThanOrEqual(25);
    expect(result.breakdown.emotionalTrigger).toBeGreaterThanOrEqual(0);
  });

  it("auto-corrects verdict based on actual score", async () => {
    const response = JSON.stringify({
      score: 90,
      breakdown: {
        hookStrength: 10,
        emotionalTrigger: 10,
        trendFit: 10,
        titleClickability: 10,
      },
      suggestions: ["test"],
      verdict: "viral", // AI says viral but calculated score is 40
    });
    const mockProvider = createMockProvider(response);
    const result = await predictViralScore({
      provider: mockProvider,
      request: baseRequest,
    });

    // Score recalculated: 10+10+10+10 = 40
    expect(result.score).toBe(40);
    expect(result.verdict).toBe("average"); // Auto-corrected from "viral"
  });

  it("recalculates score from breakdown sum", async () => {
    const response = JSON.stringify({
      score: 50, // Doesn't match breakdown sum
      breakdown: {
        hookStrength: 20,
        emotionalTrigger: 22,
        trendFit: 18,
        titleClickability: 21,
      },
      suggestions: ["test"],
      verdict: "average",
    });
    const mockProvider = createMockProvider(response);
    const result = await predictViralScore({
      provider: mockProvider,
      request: baseRequest,
    });

    // Should be recalculated: 20+22+18+21 = 81
    expect(result.score).toBe(81);
    expect(result.verdict).toBe("viral");
  });

  it("works with Korean content", async () => {
    const koreanRequest: ViralScoreRequest = {
      scriptContent: "여러분, 이 놀라운 사실을 아시나요? 90%의 사람들이 모르는 충격적인 진실!",
      title: "충격! 아무도 모르는 비밀",
      channelNiche: "교육/지식",
    };

    const koreanResponse = JSON.stringify({
      score: 68,
      breakdown: {
        hookStrength: 20,
        emotionalTrigger: 15,
        trendFit: 18,
        titleClickability: 15,
      },
      suggestions: ["후킹을 더 강력하게", "트렌드 키워드 추가"],
      verdict: "promising",
    });

    const mockProvider = createMockProvider(koreanResponse);
    const result = await predictViralScore({
      provider: mockProvider,
      request: koreanRequest,
    });

    expect(result.score).toBe(68);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});
