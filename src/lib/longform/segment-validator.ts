/**
 * Parse + validate Gemini candidate JSON into a strongly-typed array.
 *
 * Responsibilities:
 *  - tolerate ```json fences the model sometimes emits
 *  - clamp scores to [0, 100] integers
 *  - enforce 30-60s per clip (pads short, trims long)
 *  - drop overlapping segments (keep higher total score)
 *  - sort by combined score and truncate to the requested target count
 */

export interface ValidatedCandidate {
  startMs: number;
  endMs: number;
  hookScore: number;
  emotionalScore: number;
  informationDensity: number;
  trendScore: number;
  reason: string;
  titleSuggestion: string;
  transcriptSnippet: string;
}

const MIN_CLIP_MS = 30_000;
const MAX_CLIP_MS = 60_000;

export interface ParseOptions {
  targetCount: number;
  sourceDurationSeconds: number;
}

export function parseAndValidateCandidates(
  rawJson: string,
  options: ParseOptions
): ValidatedCandidate[] {
  const cleaned = stripJsonFence(rawJson);

  let parsed: { candidates?: unknown };
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Gemini JSON parse failed: ${(err as Error).message}`
    );
  }
  if (!parsed || !Array.isArray(parsed.candidates)) {
    throw new Error("Gemini response missing 'candidates' array");
  }

  const sourceMs = Math.max(0, options.sourceDurationSeconds) * 1000;

  const normalized: ValidatedCandidate[] = [];
  for (const raw of parsed.candidates) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = normalizeCandidate(
      raw as Record<string, unknown>,
      sourceMs
    );
    if (candidate) normalized.push(candidate);
  }

  // Sort by total score descending to prefer stronger segments on overlap
  const scored = normalized
    .map((c) => ({ c, total: totalScore(c) }))
    .sort((a, b) => b.total - a.total);

  // Greedy non-overlap: accept highest-scored first
  const accepted: ValidatedCandidate[] = [];
  for (const { c } of scored) {
    if (accepted.some((a) => overlaps(a, c))) continue;
    accepted.push(c);
    if (accepted.length >= options.targetCount) break;
  }

  // Return in chronological order for a predictable downstream
  accepted.sort((a, b) => a.startMs - b.startMs);
  return accepted;
}

function stripJsonFence(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return cleaned.trim();
}

function normalizeCandidate(
  raw: Record<string, unknown>,
  sourceMs: number
): ValidatedCandidate | null {
  const upperBound = sourceMs > 0 ? sourceMs : Number.MAX_SAFE_INTEGER;

  const startMs = clampInt(raw.startMs, 0, upperBound);
  let endMs = clampInt(raw.endMs, 0, upperBound);
  if (endMs <= startMs) return null;

  let duration = endMs - startMs;
  if (duration < MIN_CLIP_MS) {
    endMs = Math.min(upperBound, startMs + MIN_CLIP_MS);
    duration = endMs - startMs;
    // If the source is shorter than MIN_CLIP_MS from startMs, reject
    if (duration < MIN_CLIP_MS) return null;
  }
  if (duration > MAX_CLIP_MS) {
    endMs = startMs + MAX_CLIP_MS;
  }
  if (endMs <= startMs) return null;

  return {
    startMs,
    endMs,
    hookScore: clampInt(raw.hookScore, 0, 100),
    emotionalScore: clampInt(raw.emotionalScore, 0, 100),
    informationDensity: clampInt(raw.informationDensity, 0, 100),
    trendScore: clampInt(raw.trendScore, 0, 100),
    reason: safeString(raw.reason, 1000),
    titleSuggestion: safeString(raw.titleSuggestion, 120),
    transcriptSnippet: safeString(raw.transcriptSnippet, 500),
  };
}

function overlaps(a: ValidatedCandidate, b: ValidatedCandidate): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

function totalScore(c: ValidatedCandidate): number {
  return (
    c.hookScore + c.emotionalScore + c.informationDensity + c.trendScore
  );
}

function clampInt(value: unknown, min: number, max: number): number {
  const n =
    typeof value === "number"
      ? value
      : parseInt(String(value ?? 0), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function safeString(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.slice(0, maxLen);
}
