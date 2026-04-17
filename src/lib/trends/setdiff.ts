import { createHash } from "crypto";

// Rule 17 — Korean particle stop-word list. Deliberately small so the
// behavior is predictable and unit-testable. No morphological analyzer.
const KO_STOPWORDS = new Set([
  "은", "는", "이", "가", "을", "를", "의", "에", "와", "과",
  "도", "만", "까지", "부터", "에서", "으로", "로", "이나", "나", "면서",
]);

const MIN_LEN = 2;

/**
 * Tokenize a string into a Set of lowercased, Hangul-NFC-normalized
 * tokens of length >= MIN_LEN with stop words removed.
 *
 * Used by:
 *  - /api/trends/gap  — tokenize benchmark channel titles + descriptions
 *  - precompute-gap-rationales handler — same purpose
 *
 * Deterministic: identical input always produces identical output.
 * No randomness, no external services.
 */
export function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  const matches = text
    .normalize("NFC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  if (!matches) return out;
  for (const t of matches) {
    if (t.length < MIN_LEN) continue;
    if (KO_STOPWORDS.has(t)) continue;
    out.add(t);
  }
  return out;
}

/**
 * Compute the token set for a list of benchmark channels.
 * Combines title + (truncated) description per channel.
 */
export function buildBenchmarkTokenSet(
  channels: Array<{ title: string; description: string | null }>
): Set<string> {
  const acc = new Set<string>();
  for (const ch of channels) {
    const hay = `${ch.title} ${(ch.description ?? "").slice(0, 500)}`;
    for (const t of tokenize(hay)) acc.add(t);
  }
  return acc;
}

/**
 * Phase 9 R-05 Tier 1 set-diff.
 *
 * Inputs:
 *   - snapshots: recent trend_snapshots rows (pre-ordered by rank/date)
 *   - benchmarkTokens: Set returned by buildBenchmarkTokenSet
 *   - topN: cap the output at N gap keywords (default 10)
 *
 * Output: ordered list of gap keywords (those present in snapshots but
 * NOT present in the benchmark token set). Deduplicated by keyword,
 * first-occurrence wins, truncated to topN.
 */
export function computeGapSetDiff(
  snapshots: Array<{
    keyword: string;
    categoryId: number;
    rank: number;
    source: "youtube" | "google-trends";
  }>,
  benchmarkTokens: Set<string>,
  topN: number = 10
): Array<{
  keyword: string;
  categoryId: number;
  rank: number;
  source: "youtube" | "google-trends";
}> {
  const seen = new Set<string>();
  const out: Array<{
    keyword: string;
    categoryId: number;
    rank: number;
    source: "youtube" | "google-trends";
  }> = [];
  for (const s of snapshots) {
    if (benchmarkTokens.has(s.keyword)) continue;
    if (seen.has(s.keyword)) continue;
    seen.add(s.keyword);
    out.push(s);
    if (out.length >= topN) break;
  }
  return out;
}

/**
 * Deterministic hash of a user's benchmark channel set. Adding or
 * removing a channel changes the hash, which invalidates any cached
 * trend_gap_analyses row via the unique index on
 * (user_id, channel_set_hash, latest_snapshot_date).
 */
export function computeChannelSetHash(channelIds: string[]): string {
  const sorted = [...channelIds].sort();
  return createHash("sha256").update(sorted.join(",")).digest("hex");
}
