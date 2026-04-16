// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopicPicker } from "@/components/project/topic-picker";
import type { TopicRecommendation } from "@/lib/ai/types";

const BASE_TOPIC: TopicRecommendation = {
  title: "10분 요리 레시피",
  description: "빠른 요리",
  rationale: "트렌드 부합",
  suggestedHookType: "질문형",
  suggestedStructure: "문제-해결",
  viralPotential: "high",
};

describe("TopicPicker trendBadge", () => {
  it("renders trend badge when trendBadge is set", () => {
    const topicWithBadge: TopicRecommendation = {
      ...BASE_TOPIC,
      trendBadge: { source: "youtube", score: 0.85, keyword: "요리", categoryId: 26 },
    };
    render(
      <TopicPicker
        topics={[topicWithBadge]}
        onSelect={() => {}}
        isGenerating={false}
      />
    );
    expect(screen.getByText("🔥 트렌드")).toBeInTheDocument();
  });

  it("does not render trend badge when trendBadge is absent", () => {
    render(
      <TopicPicker
        topics={[BASE_TOPIC]}
        onSelect={() => {}}
        isGenerating={false}
      />
    );
    expect(screen.queryByText("🔥 트렌드")).not.toBeInTheDocument();
  });
});
