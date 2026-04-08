import OpenAI from "openai";

/** Supported TTS voice options */
export type TTSVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

/** Voice gender mapping for UI */
export const VOICE_GENDER: Record<TTSVoice, "male" | "female" | "neutral"> = {
  alloy: "neutral",
  echo: "male",
  fable: "male",
  onyx: "male",
  nova: "female",
  shimmer: "female",
};

/** TTS generation request */
export interface TTSRequest {
  text: string;
  voice: TTSVoice;
  /** Speed multiplier: 0.5 to 2.0 (default: 1.0) */
  speed?: number;
  /** Output format */
  format?: "mp3" | "opus" | "aac" | "flac";
}

/** TTS generation result */
export interface TTSResult {
  /** Audio buffer (raw bytes) */
  audioBuffer: Buffer;
  /** Content type for the generated audio */
  contentType: string;
  /** File extension */
  extension: string;
}

/**
 * Generate TTS audio using OpenAI TTS API.
 * Uses the tts-1 model for faster generation (tts-1-hd available for higher quality).
 *
 * @param apiKey - User's OpenAI API key (BYOK)
 * @param request - TTS parameters
 * @returns Audio buffer ready for upload
 */
export async function generateTTS(
  apiKey: string,
  request: TTSRequest
): Promise<TTSResult> {
  const client = new OpenAI({ apiKey });

  // Clamp speed to valid range
  const speed = Math.max(0.25, Math.min(4.0, request.speed ?? 1.0));
  const format = request.format ?? "mp3";

  const response = await client.audio.speech.create({
    model: "tts-1",
    voice: request.voice,
    input: request.text,
    speed,
    response_format: format,
  });

  // Convert response to Buffer
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

  const contentTypeMap: Record<string, string> = {
    mp3: "audio/mpeg",
    opus: "audio/opus",
    aac: "audio/aac",
    flac: "audio/flac",
  };

  return {
    audioBuffer,
    contentType: contentTypeMap[format] ?? "audio/mpeg",
    extension: format,
  };
}

/**
 * Get available voices with their descriptions for UI display.
 */
export function getAvailableVoices(): Array<{
  id: TTSVoice;
  name: string;
  gender: "male" | "female" | "neutral";
  description: string;
}> {
  return [
    { id: "alloy", name: "Alloy", gender: "neutral", description: "중성적이고 균형 잡힌 목소리" },
    { id: "echo", name: "Echo", gender: "male", description: "깊고 차분한 남성 목소리" },
    { id: "fable", name: "Fable", gender: "male", description: "서사적이고 따뜻한 남성 목소리" },
    { id: "onyx", name: "Onyx", gender: "male", description: "낮고 강한 남성 목소리" },
    { id: "nova", name: "Nova", gender: "female", description: "밝고 활기찬 여성 목소리" },
    { id: "shimmer", name: "Shimmer", gender: "female", description: "부드럽고 감성적인 여성 목소리" },
  ];
}
