import OpenAI from "openai";
import type { AIProvider, GenerateOptions } from "./types";

export function createOpenAIProvider(apiKey: string): AIProvider {
  const client = new OpenAI({ apiKey });

  return {
    name: "openai",

    async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
      const messages: OpenAI.ChatCompletionMessageParam[] = [];

      if (options?.systemInstruction) {
        messages.push({
          role: "system",
          content: options.systemInstruction,
        });
      }

      messages.push({
        role: "user",
        content: prompt,
      });

      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
        ...(options?.jsonMode
          ? { response_format: { type: "json_object" } }
          : {}),
      });

      const text = completion.choices[0]?.message?.content;

      if (!text) {
        throw new Error("OpenAI returned empty response");
      }

      return text;
    },
  };
}
