import type { AIProvider } from "@/lib/ai/types";
import type { ViralScoreRequest, ViralScoreResult } from "./types";

const VIRAL_SCORE_SYSTEM_INSTRUCTION = `You are a YouTube Shorts viral prediction expert. Analyze the content and predict its viral potential on a 0-100 scale.

Score each dimension (0-25 each, total 100):
1. hookStrength: First 3 seconds hook power -- curiosity gap, shock value, question, controversy
2. emotionalTrigger: Emotional resonance -- humor, surprise, empathy, fear, excitement
3. trendFit: Alignment with current trends, cultural relevance, timely topics
4. titleClickability: Title clickbait power -- specificity, numbers, power words, curiosity

Verdict:
- 80-100: "viral" -- high probability of significant reach
- 60-79: "promising" -- good potential with minor improvements
- 40-59: "average" -- needs work in specific areas
- 0-39: "weak" -- fundamental changes recommended

Provide 3-5 actionable improvement suggestions in the script's language.

Return ONLY valid JSON matching this schema:
{
  "score": number,
  "breakdown": {
    "hookStrength": number,
    "emotionalTrigger": number,
    "trendFit": number,
    "titleClickability": number
  },
  "suggestions": ["string"],
  "verdict": "viral" | "promising" | "average" | "weak"
}`;

/**
 * Predict viral potential of a YouTube Shorts video.
 *
 * Uses AI to analyze script content, title, and metadata to generate
 * a 0-100 viral score with a 4-dimension breakdown.
 */
export async function predictViralScore(params: {
  provider: AIProvider;
  request: ViralScoreRequest;
}): Promise<ViralScoreResult> {
  const { provider, request } = params;

  const userPrompt = buildViralScorePrompt(request);

  const response = await provider.generateText(userPrompt, {
    systemInstruction: VIRAL_SCORE_SYSTEM_INSTRUCTION,
    jsonMode: true,
    temperature: 0.3, // Low temperature for consistent scoring
  });

  const parsed = parseViralScoreResponse(response);
  return validateAndFixViralScore(parsed);
}

function buildViralScorePrompt(request: ViralScoreRequest): string {
  const parts: string[] = [
    `## Title\n${request.title}`,
    `## Script Content\n${request.scriptContent}`,
  ];

  if (request.description) {
    parts.push(`## Description\n${request.description}`);
  }
  if (request.hashtags && request.hashtags.length > 0) {
    parts.push(`## Hashtags\n${request.hashtags.join(" ")}`);
  }
  if (request.channelNiche) {
    parts.push(`## Channel Niche\n${request.channelNiche}`);
  }
  if (request.thumbnailUrl) {
    parts.push(`## Thumbnail\n[Image available at: ${request.thumbnailUrl}]`);
  }

  parts.push(
    "\nAnalyze the viral potential of this YouTube Shorts content. Return JSON only."
  );

  return parts.join("\n\n");
}

function parseViralScoreResponse(response: string): ViralScoreResult {
  let cleaned = response.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned) as ViralScoreResult;

    if (typeof parsed.score !== "number") {
      throw new Error("Missing or invalid 'score' field");
    }
    if (!parsed.breakdown || typeof parsed.breakdown !== "object") {
      throw new Error("Missing or invalid 'breakdown' field");
    }
    if (!Array.isArray(parsed.suggestions)) {
      throw new Error("Missing or invalid 'suggestions' field");
    }
    if (!parsed.verdict) {
      throw new Error("Missing 'verdict' field");
    }

    return parsed;
  } catch (err) {
    throw new Error(
      `Failed to parse viral score response: ${err instanceof Error ? err.message : "Invalid JSON"}`
    );
  }
}

/**
 * Validate and auto-correct viral score result.
 * Ensures each dimension is 0-25, total matches score, and verdict matches range.
 */
function validateAndFixViralScore(result: ViralScoreResult): ViralScoreResult {
  const { breakdown } = result;

  // Clamp each dimension to 0-25
  breakdown.hookStrength = clamp(breakdown.hookStrength, 0, 25);
  breakdown.emotionalTrigger = clamp(breakdown.emotionalTrigger, 0, 25);
  breakdown.trendFit = clamp(breakdown.trendFit, 0, 25);
  breakdown.titleClickability = clamp(breakdown.titleClickability, 0, 25);

  // Recalculate score from breakdown
  const calculatedScore =
    breakdown.hookStrength +
    breakdown.emotionalTrigger +
    breakdown.trendFit +
    breakdown.titleClickability;

  result.score = clamp(calculatedScore, 0, 100);

  // Auto-correct verdict based on score
  if (result.score >= 80) {
    result.verdict = "viral";
  } else if (result.score >= 60) {
    result.verdict = "promising";
  } else if (result.score >= 40) {
    result.verdict = "average";
  } else {
    result.verdict = "weak";
  }

  return result;
}

function clamp(value: number, min: number, max: number): number {
  if (typeof value !== "number" || isNaN(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}
