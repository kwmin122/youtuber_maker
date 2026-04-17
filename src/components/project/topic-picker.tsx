"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { TopicRecommendation } from "@/lib/ai/types";

interface TopicPickerProps {
  topics: TopicRecommendation[];
  onSelect: (topicIndex: number) => void;
  isGenerating: boolean;
}

const viralBadgeColor = {
  high: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  low: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300",
};

export function TopicPicker({
  topics,
  onSelect,
  isGenerating,
}: TopicPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">추천 주제 선택</h3>
      <p className="text-xs text-muted-foreground">
        대본을 생성할 주제를 선택하세요. A/B 변형이 자동으로 생성됩니다.
      </p>

      <div className="grid gap-2">
        {topics.map((topic, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setSelectedIndex(index)}
            className={`w-full rounded-lg border p-3 text-left transition-colors ${
              selectedIndex === index
                ? "border-primary bg-primary/5"
                : "hover:bg-muted/50"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{topic.title}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${viralBadgeColor[topic.viralPotential]}`}
                  >
                    {topic.viralPotential === "high"
                      ? "바이럴 높음"
                      : topic.viralPotential === "medium"
                        ? "보통"
                        : "낮음"}
                  </span>
                  {topic.trendBadge && (
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      🔥 트렌드
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {topic.description}
                </p>
              </div>
            </div>
            {selectedIndex === index && (
              <div className="mt-2 space-y-1 border-t pt-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">추천 이유:</span>{" "}
                  {topic.rationale}
                </p>
                <div className="flex gap-2 text-xs">
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    후킹: {topic.suggestedHookType}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    구조: {topic.suggestedStructure}
                  </span>
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      <Button
        onClick={() => selectedIndex !== null && onSelect(selectedIndex)}
        disabled={selectedIndex === null || isGenerating}
        className="w-full"
      >
        {isGenerating
          ? "대본 생성 중..."
          : selectedIndex !== null
            ? `"${topics[selectedIndex].title}" 대본 생성`
            : "주제를 선택하세요"}
      </Button>
    </div>
  );
}
