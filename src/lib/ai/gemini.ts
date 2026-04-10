import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import type {
  AIProvider,
  GenerateJsonFromAudioParams,
  GenerateOptions,
} from "./types";

const DEFAULT_MODEL = "gemini-2.0-flash";
const LONGFORM_DEFAULT_MODEL = "gemini-2.5-pro";
const FILE_READY_POLL_MS = 2000;
const FILE_READY_TIMEOUT_MS = 120_000;

export function createGeminiProvider(apiKey: string): AIProvider {
  const genAI = new GoogleGenerativeAI(apiKey);
  const fileManager = new GoogleAIFileManager(apiKey);

  return {
    name: "gemini",

    async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
      return generateTextInternal(genAI, prompt, {
        ...options,
        model: DEFAULT_MODEL,
      });
    },

    async generateTextWithModel(
      prompt: string,
      options: GenerateOptions & { model: string }
    ): Promise<string> {
      return generateTextInternal(genAI, prompt, options);
    },

    async generateJsonFromAudio(
      params: GenerateJsonFromAudioParams
    ): Promise<string> {
      const uploadResp = await fileManager.uploadFile(params.audioPath, {
        mimeType: params.mimeType,
        displayName: `longform-audio-${Date.now()}`,
      });
      const fileName = uploadResp.file.name;
      const fileUri = uploadResp.file.uri;

      // Poll until ACTIVE — Gemini Files API processes large audio async
      let file = await fileManager.getFile(fileName);
      const start = Date.now();
      while (
        file.state === FileState.PROCESSING &&
        Date.now() - start < FILE_READY_TIMEOUT_MS
      ) {
        await new Promise((r) => setTimeout(r, FILE_READY_POLL_MS));
        file = await fileManager.getFile(fileName);
      }
      if (file.state !== FileState.ACTIVE) {
        await fileManager.deleteFile(fileName).catch(() => {});
        throw new Error(
          `Gemini file upload failed: state=${file.state} name=${fileName}`
        );
      }

      try {
        const model = genAI.getGenerativeModel({
          model: params.model ?? LONGFORM_DEFAULT_MODEL,
          generationConfig: {
            responseMimeType: "application/json",
            temperature: params.temperature ?? 0.3,
            maxOutputTokens: 8192,
          },
          ...(params.systemInstruction
            ? { systemInstruction: params.systemInstruction }
            : {}),
        });

        const result = await model.generateContent([
          { fileData: { fileUri, mimeType: params.mimeType } },
          { text: params.prompt },
        ]);
        const text = result.response.text();
        if (!text) throw new Error("Gemini audio analysis returned empty response");
        return text;
      } finally {
        // Best-effort delete; don't fail analysis if cleanup fails
        await fileManager.deleteFile(fileName).catch(() => {});
      }
    },
  };
}

async function generateTextInternal(
  genAI: GoogleGenerativeAI,
  prompt: string,
  options: GenerateOptions & { model: string }
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: options.model,
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
}
