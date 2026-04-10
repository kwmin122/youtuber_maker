import OpenAI from "openai";
import type { ThumbnailGenerationRequest, ThumbnailResult } from "./types";

/**
 * Variant prompt templates for thumbnail A/B generation.
 * Each variant has a different visual style to test what resonates.
 */
const VARIANT_CONFIGS: Array<{
  variant: string;
  styleLabel: string;
  promptPrefix: string;
}> = [
  {
    variant: "A",
    styleLabel: "vibrant",
    promptPrefix:
      "Eye-catching YouTube Shorts thumbnail, 1280x720 landscape, vibrant colors, bold composition, dramatic lighting, high contrast.",
  },
  {
    variant: "B",
    styleLabel: "minimal",
    promptPrefix:
      "Clean minimalist YouTube thumbnail, 1280x720 landscape, simple composition, clear focal point, flat design, muted palette.",
  },
  {
    variant: "C",
    styleLabel: "text-heavy",
    promptPrefix:
      "YouTube thumbnail with prominent text space, 1280x720 landscape, expressive face or reaction, text-heavy layout with clear reading areas.",
  },
];

/**
 * Generate 2-3 thumbnail variants using DALL-E 3.
 *
 * Uses "1792x1024" (landscape) -- the closest DALL-E 3 size to 16:9.
 * Images should be resized/cropped to 1280x720 after download for YouTube.
 *
 * @param params.apiKey - User's OpenAI API key (BYOK)
 * @param params.request - Thumbnail generation parameters
 * @returns Array of ThumbnailResult (one per variant)
 */
export async function generateThumbnails(params: {
  apiKey: string;
  request: ThumbnailGenerationRequest;
}): Promise<ThumbnailResult[]> {
  const { apiKey, request } = params;
  const client = new OpenAI({ apiKey });

  // Extract a short summary from the script for the prompt
  const scriptSummary = request.scriptContent.slice(0, 200).trim();
  const variantCount = Math.min(request.variantCount, 3);
  const configs = VARIANT_CONFIGS.slice(0, variantCount);

  const results: ThumbnailResult[] = [];

  for (const config of configs) {
    const prompt = `${config.promptPrefix} Topic: "${request.title}". Scene summary: ${scriptSummary}. No text overlay in the image.`;

    try {
      const thumbnail = await generateThumbnailImage(client, prompt);
      results.push({
        variant: config.variant,
        url: thumbnail.url,
        prompt,
        revisedPrompt: thumbnail.revisedPrompt,
      });
    } catch (error) {
      console.warn(
        `Thumbnail variant ${config.variant} generation failed:`,
        error instanceof Error ? error.message : error
      );
      // Continue with remaining variants even if one fails
    }
  }

  if (results.length === 0) {
    throw new Error("All thumbnail variants failed to generate");
  }

  return results;
}

/**
 * Generate a single thumbnail image using DALL-E 3 in landscape format.
 *
 * Size "1792x1024" is the closest DALL-E 3 supports to 16:9 landscape.
 * The image should be resized to 1280x720 after download.
 */
async function generateThumbnailImage(
  client: OpenAI,
  prompt: string
): Promise<{ url: string; revisedPrompt?: string }> {
  const response = await client.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1792x1024", // Landscape -- closest to 16:9 for YouTube thumbnails
    quality: "standard",
    response_format: "url",
  });

  if (!response.data || response.data.length === 0) {
    throw new Error("DALL-E 3 returned no image data for thumbnail");
  }

  const imageData = response.data[0];
  if (!imageData?.url) {
    throw new Error("DALL-E 3 returned no image URL for thumbnail");
  }

  return {
    url: imageData.url,
    revisedPrompt: imageData.revised_prompt ?? undefined,
  };
}
