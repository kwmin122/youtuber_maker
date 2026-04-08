import type { AIProvider, AIProviderName } from "./types";
import { createGeminiProvider } from "./gemini";
import { createOpenAIProvider } from "./openai";

export function createAIProvider(
  providerName: AIProviderName,
  apiKey: string
): AIProvider {
  switch (providerName) {
    case "gemini":
      return createGeminiProvider(apiKey);
    case "openai":
      return createOpenAIProvider(apiKey);
    default:
      throw new Error(`Unsupported AI provider: ${providerName}`);
  }
}
