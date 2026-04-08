import { describe, it, expect } from "vitest";
import {
  buildSceneSplitPrompt,
  parseSceneSplitResponse,
} from "@/lib/ai/prompts";

describe("buildSceneSplitPrompt", () => {
  it("builds a prompt with script content and title", () => {
    const { systemInstruction, userPrompt } = buildSceneSplitPrompt({
      scriptContent: "안녕하세요 여러분! 오늘은 특별한 이야기를 해볼게요...",
      scriptTitle: "놀라운 AI 기술",
    });

    expect(systemInstruction).toContain("scene director");
    expect(userPrompt).toContain("놀라운 AI 기술");
    expect(userPrompt).toContain("안녕하세요 여러분");
    expect(userPrompt).toContain("6개"); // default target
  });

  it("respects custom targetSceneCount", () => {
    const { userPrompt } = buildSceneSplitPrompt({
      scriptContent: "테스트 대본",
      scriptTitle: "테스트",
      targetSceneCount: 4,
    });
    expect(userPrompt).toContain("4개");
  });

  it("includes imageStyle when provided", () => {
    const { userPrompt } = buildSceneSplitPrompt({
      scriptContent: "테스트 대본",
      scriptTitle: "테스트",
      imageStyle: "anime",
    });
    expect(userPrompt).toContain("anime");
  });
});

describe("parseSceneSplitResponse", () => {
  const validResponse = JSON.stringify({
    scenes: [
      {
        sceneIndex: 0,
        narration: "안녕하세요!",
        imagePrompt: "A person waving, vertical 9:16",
        videoPrompt: "Camera slowly zooms in on a person waving",
        estimatedDuration: 5,
      },
      {
        sceneIndex: 1,
        narration: "오늘의 주제는요",
        imagePrompt: "Title card with bold text, vertical 9:16",
        videoPrompt: "Text appears with dynamic motion",
        estimatedDuration: 4,
      },
      {
        sceneIndex: 2,
        narration: "정말 놀랍죠?",
        imagePrompt: "Surprised face expression, vertical 9:16",
        videoPrompt: "Camera pulls back to reveal the full scene",
        estimatedDuration: 6,
      },
      {
        sceneIndex: 3,
        narration: "구독 부탁드려요!",
        imagePrompt: "Subscribe button animation, vertical 9:16",
        videoPrompt: "Subscribe button zooms in with sparkle effect",
        estimatedDuration: 3,
      },
    ],
    totalEstimatedDuration: 18,
  });

  it("parses valid JSON response", () => {
    const result = parseSceneSplitResponse(validResponse);
    expect(result.scenes).toHaveLength(4);
    expect(result.scenes[0].narration).toBe("안녕하세요!");
    expect(result.scenes[0].imagePrompt).toContain("9:16");
    expect(result.totalEstimatedDuration).toBe(18);
  });

  it("handles markdown-wrapped JSON", () => {
    const wrapped = "```json\n" + validResponse + "\n```";
    const result = parseSceneSplitResponse(wrapped);
    expect(result.scenes).toHaveLength(4);
  });

  it("throws on empty scenes array", () => {
    const empty = JSON.stringify({ scenes: [], totalEstimatedDuration: 0 });
    expect(() => parseSceneSplitResponse(empty)).toThrow("missing");
  });

  it("throws on missing required scene fields", () => {
    const missing = JSON.stringify({
      scenes: [{ sceneIndex: 0, narration: "hello" }],
    });
    expect(() => parseSceneSplitResponse(missing)).toThrow("missing required fields");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseSceneSplitResponse("not json")).toThrow("Failed to parse");
  });

  it("auto-assigns sceneIndex if missing", () => {
    const noIndex = JSON.stringify({
      scenes: [
        { narration: "test", imagePrompt: "img", videoPrompt: "vid" },
        { narration: "test2", imagePrompt: "img2", videoPrompt: "vid2" },
      ],
    });
    const result = parseSceneSplitResponse(noIndex);
    expect(result.scenes[0].sceneIndex).toBe(0);
    expect(result.scenes[1].sceneIndex).toBe(1);
  });

  it("calculates totalEstimatedDuration if missing", () => {
    const noDuration = JSON.stringify({
      scenes: [
        {
          narration: "test",
          imagePrompt: "img",
          videoPrompt: "vid",
          estimatedDuration: 5,
        },
        {
          narration: "test2",
          imagePrompt: "img2",
          videoPrompt: "vid2",
          estimatedDuration: 3,
        },
      ],
    });
    const result = parseSceneSplitResponse(noDuration);
    expect(result.totalEstimatedDuration).toBe(8);
  });
});
