import { describe, it, expect, vi } from "vitest";
import type { AIProvider } from "@/lib/ai/types";
import { generateSEO } from "@/lib/distribution/seo-generator";
import type { SEOGenerationRequest } from "@/lib/distribution/types";

function createMockProvider(response: string): AIProvider {
  return {
    name: "openai",
    generateText: vi.fn().mockResolvedValue(response),
  };
}

const validSEOResponse = JSON.stringify({
  title: "Test Title for YouTube Shorts",
  description: "A test description for the video with keywords and CTA.",
  hashtags: ["#shorts", "#test", "#youtube", "#viral", "#trending"],
  tags: ["test", "youtube", "shorts", "trending"],
  titleVariants: ["Variant Title 1", "Variant Title 2"],
});

const baseRequest: SEOGenerationRequest = {
  projectId: "test-project-id",
  scriptContent: "This is a test script about interesting facts.",
  language: "ko",
};

describe("seo-generator", () => {
  it("returns a valid SEOResult with all required fields", async () => {
    const mockProvider = createMockProvider(validSEOResponse);
    const result = await generateSEO({ provider: mockProvider, request: baseRequest });

    expect(result.title).toBe("Test Title for YouTube Shorts");
    expect(result.description).toBeTruthy();
    expect(result.hashtags).toHaveLength(5);
    expect(result.tags).toHaveLength(4);
    expect(result.titleVariants).toHaveLength(2);
  });

  it("truncates title if longer than 100 chars", async () => {
    const longTitle = "A".repeat(120);
    const response = JSON.stringify({
      title: longTitle,
      description: "desc",
      hashtags: ["#shorts", "#test", "#a", "#b", "#c"],
      tags: ["tag"],
      titleVariants: ["v1"],
    });
    const mockProvider = createMockProvider(response);
    const result = await generateSEO({ provider: mockProvider, request: baseRequest });

    expect(result.title.length).toBeLessThanOrEqual(100);
    expect(result.title.endsWith("...")).toBe(true);
  });

  it("validates tags total character limit", async () => {
    const longTags = Array.from({ length: 100 }, (_, i) => `verylongtag${i}`);
    const response = JSON.stringify({
      title: "Title",
      description: "desc",
      hashtags: ["#shorts", "#test", "#a", "#b", "#c"],
      tags: longTags,
      titleVariants: ["v1"],
    });
    const mockProvider = createMockProvider(response);
    const result = await generateSEO({ provider: mockProvider, request: baseRequest });

    const totalChars = result.tags.join(",").length;
    expect(totalChars).toBeLessThanOrEqual(500);
  });

  it("works with Korean script content", async () => {
    const koreanRequest: SEOGenerationRequest = {
      projectId: "test-id",
      scriptContent: "오늘은 놀라운 사실들에 대해 알아보겠습니다. 여러분이 몰랐던 충격적인 이야기!",
      language: "ko",
      channelNiche: "교육/지식",
    };

    const koreanResponse = JSON.stringify({
      title: "당신이 몰랐던 충격적인 사실 5가지",
      description: "오늘 알려드리는 놀라운 사실들! 구독과 좋아요 부탁드립니다.",
      hashtags: ["#shorts", "#사실", "#충격", "#지식", "#교육"],
      tags: ["사실", "충격", "지식"],
      titleVariants: ["충격! 이것도 몰랐어?", "5가지 놀라운 사실"],
    });

    const mockProvider = createMockProvider(koreanResponse);
    const result = await generateSEO({ provider: mockProvider, request: koreanRequest });

    expect(result.title).toContain("충격");
    expect(result.hashtags).toContain("#shorts");
  });

  it("throws descriptive error for malformed JSON", async () => {
    const mockProvider = createMockProvider("not valid json at all");

    await expect(
      generateSEO({ provider: mockProvider, request: baseRequest })
    ).rejects.toThrow("Failed to parse SEO response");
  });

  it("ensures hashtags start with #", async () => {
    const response = JSON.stringify({
      title: "Title",
      description: "desc",
      hashtags: ["shorts", "#test", "nohash", "#valid", "another"],
      tags: ["tag"],
      titleVariants: ["v1"],
    });
    const mockProvider = createMockProvider(response);
    const result = await generateSEO({ provider: mockProvider, request: baseRequest });

    for (const tag of result.hashtags) {
      expect(tag.startsWith("#")).toBe(true);
    }
  });
});
