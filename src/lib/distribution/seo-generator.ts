import type { AIProvider } from "@/lib/ai/types";
import type { SEOGenerationRequest, SEOResult } from "./types";

const SEO_SYSTEM_INSTRUCTION = `You are a YouTube Shorts SEO specialist. Analyze the script and generate optimized metadata that maximizes discoverability and click-through rate.

Rules:
- Title: max 100 chars, include primary keyword, use emotional trigger or curiosity gap
- Description: max 5000 chars, include key takeaways, call-to-action, relevant keywords naturally
- Hashtags: 5-15 hashtags, mix of broad (#shorts) and niche-specific
- Tags: YouTube tags, total under 500 chars combined, include long-tail keywords
- Generate 2-3 title variants for A/B comparison
- Language must match the script language

Return ONLY valid JSON matching this schema:
{
  "title": "string",
  "description": "string",
  "hashtags": ["string"],
  "tags": ["string"],
  "titleVariants": ["string"]
}`;

/**
 * Generate SEO-optimized metadata for a YouTube Shorts video.
 *
 * Uses AI to analyze the script content and generate title, description,
 * hashtags, tags, and title variants for A/B testing.
 */
export async function generateSEO(params: {
  provider: AIProvider;
  request: SEOGenerationRequest;
}): Promise<SEOResult> {
  const { provider, request } = params;

  const userPrompt = buildSEOPrompt(request);

  const response = await provider.generateText(userPrompt, {
    systemInstruction: SEO_SYSTEM_INSTRUCTION,
    jsonMode: true,
    temperature: 0.7,
  });

  const parsed = parseSEOResponse(response);
  return validateAndFixSEO(parsed);
}

function buildSEOPrompt(request: SEOGenerationRequest): string {
  const parts: string[] = [
    `## Script Content\n\n${request.scriptContent}`,
  ];

  if (request.channelNiche) {
    parts.push(`## Channel Niche\n${request.channelNiche}`);
  }
  if (request.targetAudience) {
    parts.push(`## Target Audience\n${request.targetAudience}`);
  }
  parts.push(`## Language\n${request.language || "ko"}`);
  parts.push(
    "\nGenerate SEO-optimized metadata for this YouTube Shorts script. Return JSON only."
  );

  return parts.join("\n\n");
}

function parseSEOResponse(response: string): SEOResult {
  let cleaned = response.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned) as SEOResult;

    if (!parsed.title || typeof parsed.title !== "string") {
      throw new Error("Missing or invalid 'title' field");
    }
    if (!parsed.description || typeof parsed.description !== "string") {
      throw new Error("Missing or invalid 'description' field");
    }
    if (!Array.isArray(parsed.hashtags)) {
      throw new Error("Missing or invalid 'hashtags' field");
    }
    if (!Array.isArray(parsed.tags)) {
      throw new Error("Missing or invalid 'tags' field");
    }
    if (!Array.isArray(parsed.titleVariants)) {
      throw new Error("Missing or invalid 'titleVariants' field");
    }

    return parsed;
  } catch (err) {
    throw new Error(
      `Failed to parse SEO response: ${err instanceof Error ? err.message : "Invalid JSON"}`
    );
  }
}

/**
 * Validate and auto-fix SEO result to meet YouTube constraints.
 * Rather than throwing, silently truncates/adjusts values.
 */
function validateAndFixSEO(seo: SEOResult): SEOResult {
  // Title: max 100 chars
  if (seo.title.length > 100) {
    seo.title = seo.title.slice(0, 97) + "...";
  }

  // Description: max 5000 chars
  if (seo.description.length > 5000) {
    seo.description = seo.description.slice(0, 4997) + "...";
  }

  // Hashtags: ensure 5-15 items
  if (seo.hashtags.length > 15) {
    seo.hashtags = seo.hashtags.slice(0, 15);
  }

  // Ensure hashtags start with #
  seo.hashtags = seo.hashtags.map((h) =>
    h.startsWith("#") ? h : `#${h}`
  );

  // Tags: total chars under 500
  let totalTagChars = seo.tags.join(",").length;
  while (totalTagChars > 500 && seo.tags.length > 0) {
    seo.tags.pop();
    totalTagChars = seo.tags.join(",").length;
  }

  // Title variants: max 100 chars each
  seo.titleVariants = seo.titleVariants.map((v) =>
    v.length > 100 ? v.slice(0, 97) + "..." : v
  );

  return seo;
}
