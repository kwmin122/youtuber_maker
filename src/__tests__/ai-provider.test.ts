import { describe, it, expect } from "vitest";
import { createAIProvider } from "@/lib/ai/provider";

describe("createAIProvider", () => {
  it("creates gemini provider with correct name", () => {
    const provider = createAIProvider("gemini", "fake-key");
    expect(provider.name).toBe("gemini");
    expect(typeof provider.generateText).toBe("function");
  });

  it("creates openai provider with correct name", () => {
    const provider = createAIProvider("openai", "fake-key");
    expect(provider.name).toBe("openai");
    expect(typeof provider.generateText).toBe("function");
  });

  it("throws for unsupported provider", () => {
    expect(() =>
      createAIProvider("unsupported" as any, "fake-key")
    ).toThrow("Unsupported AI provider");
  });
});
