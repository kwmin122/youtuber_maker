import OpenAI from "openai";
import type { ImageGenerationRequest, ImageGenerationResult, ImageStyle } from "./types";

/**
 * Generate an image using OpenAI DALL-E 3.
 * Returns the temporary URL -- caller must download and upload to Supabase Storage.
 *
 * @param apiKey - User's OpenAI API key (BYOK)
 * @param request - Image generation parameters
 */
export async function generateImage(
  apiKey: string,
  request: ImageGenerationRequest
): Promise<ImageGenerationResult> {
  const client = new OpenAI({ apiKey });

  const styleInstruction = getStyleInstruction(request.style);
  const fullPrompt = `${styleInstruction}\n\n${request.prompt}`;

  const response = await client.images.generate({
    model: "dall-e-3",
    prompt: fullPrompt,
    n: 1,
    size: request.size, // "1024x1792" for 9:16 vertical
    quality: "standard",
    response_format: "url",
  });

  const imageData = response.data[0];
  if (!imageData?.url) {
    throw new Error("DALL-E 3 returned no image URL");
  }

  return {
    url: imageData.url,
    revisedPrompt: imageData.revised_prompt ?? undefined,
  };
}

/**
 * Map ImageStyle enum to DALL-E 3 style instruction prefix.
 */
function getStyleInstruction(style: ImageStyle): string {
  const instructions: Record<ImageStyle, string> = {
    realistic:
      "Photorealistic style. Highly detailed, natural lighting, realistic textures and proportions.",
    anime:
      "Anime/manga art style. Bold lines, vibrant colors, expressive characters, Japanese animation aesthetic.",
    cartoon:
      "Cartoon illustration style. Bright colors, simplified shapes, playful and engaging.",
    "3d-render":
      "3D rendered style. Smooth surfaces, volumetric lighting, CGI quality, Pixar-like aesthetic.",
    watercolor:
      "Watercolor painting style. Soft washes, visible brush strokes, delicate color blending.",
    cinematic:
      "Cinematic style. Dramatic lighting, shallow depth of field, movie-quality framing, widescreen feel adapted to vertical.",
    illustration:
      "Digital illustration style. Clean lines, rich colors, professional concept art quality.",
  };
  return instructions[style] ?? instructions.realistic;
}
