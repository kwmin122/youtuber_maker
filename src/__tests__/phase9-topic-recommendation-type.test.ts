import { describe, it, expect } from "vitest";
import type { TopicRecommendation } from "@/lib/ai/types";

describe("Phase 9 — TopicRecommendation canonical type", () => {
  it("accepts the base shape without trendBadge", () => {
    const rec: TopicRecommendation = {
      title: "title",
      description: "desc",
      rationale: "why",
      suggestedHookType: "question",
      suggestedStructure: "PAS",
      viralPotential: "high",
    };
    expect(rec.title).toBe("title");
    expect(rec.trendBadge).toBeUndefined();
  });

  it("accepts the extended shape with trendBadge", () => {
    const rec: TopicRecommendation = {
      title: "title",
      description: "desc",
      rationale: "why",
      suggestedHookType: "question",
      suggestedStructure: "PAS",
      viralPotential: "high",
      trendBadge: {
        source: "youtube",
        score: 87,
        keyword: "밈",
        categoryId: 24,
      },
    };
    expect(rec.trendBadge?.source).toBe("youtube");
  });
});
