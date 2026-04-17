import type { TrendingVideoItem } from "@/lib/youtube/client";

// Minimal Korean stop-word list. Rule 17: keep deterministic, no
// morphological analyzer. 09-04 ships the shared version in setdiff.ts.
const KO_STOPWORDS = new Set([
  "은", "는", "이", "가", "을", "를", "의", "에", "와", "과",
  "도", "만", "까지", "부터", "에서", "으로", "로", "이나", "나", "면서",
]);

const MIN_LEN = 2;
const MAX_PER_ITEM = 6;

/**
 * Extract up to MAX_PER_ITEM keywords from a trending item's title +
 * (truncated) description. Keywords are tokens of length >= MIN_LEN
 * that are not stop words, lowercased for ascii and NFC-normalized
 * for Hangul.
 */
export function extractKeywordsFromTrendingItem(
  item: TrendingVideoItem
): string[] {
  const haystack = `${item.title} ${(item.description || "").slice(0, 160)}`;
  const tokens = haystack
    .normalize("NFC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) || [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (t.length < MIN_LEN) continue;
    if (KO_STOPWORDS.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_PER_ITEM) break;
  }
  return out;
}
