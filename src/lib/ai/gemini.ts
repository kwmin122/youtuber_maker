import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIProvider, GenerateOptions } from "./types";

export function createGeminiProvider(apiKey: string): AIProvider {
  const genAI = new GoogleGenerativeAI(apiKey);

  return {
    name: "gemini",

    async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: {
          maxOutputTokens: options?.maxTokens ?? 4096,
          temperature: options?.temperature ?? 0.7,
          responseMimeType: options?.jsonMode ? "application/json" : undefined,
        },
        ...(options?.systemInstruction
          ? { systemInstruction: options.systemInstruction }
          : {}),
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      if (!text) {
        throw new Error("Gemini returned empty response");
      }

      return text;
    },
  };
}
