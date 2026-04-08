import { describe, it, expect } from "vitest";

// Test the transcript segment structure and fullText generation
describe("Transcript data structure", () => {
  const mockSegments = [
    { text: "안녕하세요", offset: 0, duration: 2000 },
    { text: "오늘은 특별한 날입니다", offset: 2000, duration: 3000 },
    { text: "시작해볼까요?", offset: 5000, duration: 2000 },
  ];

  it("segments have required fields", () => {
    for (const seg of mockSegments) {
      expect(seg).toHaveProperty("text");
      expect(seg).toHaveProperty("offset");
      expect(seg).toHaveProperty("duration");
      expect(typeof seg.text).toBe("string");
      expect(typeof seg.offset).toBe("number");
      expect(typeof seg.duration).toBe("number");
    }
  });

  it("generates fullText from segments", () => {
    const fullText = mockSegments.map((s) => s.text).join(" ");
    expect(fullText).toBe(
      "안녕하세요 오늘은 특별한 날입니다 시작해볼까요?"
    );
  });

  it("offsets are monotonically increasing", () => {
    for (let i = 1; i < mockSegments.length; i++) {
      expect(mockSegments[i].offset).toBeGreaterThanOrEqual(
        mockSegments[i - 1].offset
      );
    }
  });

  it("durations are positive", () => {
    for (const seg of mockSegments) {
      expect(seg.duration).toBeGreaterThan(0);
    }
  });
});

describe("Language priority", () => {
  const languagePriority = ["ko", "en"];

  it("Korean is highest priority", () => {
    expect(languagePriority[0]).toBe("ko");
  });

  it("English is second priority", () => {
    expect(languagePriority[1]).toBe("en");
  });
});
