import { env } from "@/lib/env";

export type GoogleTrendKeyword = {
  keyword: string;
  score: number; // 0..100 — google-trends-api returns normalized interest
};

/**
 * Phase 9 R-01 + rules 12, 13.
 *
 * Feature-flag gated daily-trends fetch. Returns [] on ANY of:
 *  - `GOOGLE_TRENDS_ENABLED` is false (never imports the package)
 *  - Dynamic import throws (package missing, bot detection, network)
 *  - API returns invalid JSON
 *  - API returns zero trends for the geo
 *
 * The caller (ingest-trends handler) MUST treat [] as a non-fatal soft
 * fail and continue with YouTube data only.
 */
export async function fetchDailyTrends(params: {
  geo: string;
}): Promise<GoogleTrendKeyword[]> {
  if (!env.GOOGLE_TRENDS_ENABLED) {
    // Rule 13: do not import when disabled.
    return [];
  }

  try {
    // Rule 13: dynamic import inside the feature-flag branch.
    const mod = await import("google-trends-api");
    const raw = await mod.dailyTrends({
      trendDate: new Date(),
      geo: params.geo,
      hl: "ko",
    });

    // google-trends-api returns a JSON string; parse defensively.
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(
        "[google-trends-client] invalid JSON response, returning []"
      );
      return [];
    }

    // Shape: { default: { trendingSearchesDays: [ { trendingSearches: [ { title: {query}, formattedTraffic: "200K+" }, ... ] } ] } }
    const days =
      (parsed as {
        default?: {
          trendingSearchesDays?: Array<{
            trendingSearches?: Array<{
              title?: { query?: string };
              formattedTraffic?: string;
            }>;
          }>;
        };
      })?.default?.trendingSearchesDays || [];

    const out: GoogleTrendKeyword[] = [];
    for (const day of days) {
      for (const ts of day.trendingSearches || []) {
        const kw = ts.title?.query?.trim();
        if (!kw) continue;
        out.push({
          keyword: kw,
          score: normalizeTraffic(ts.formattedTraffic),
        });
      }
    }
    return out;
  } catch (err) {
    // Rule 12: ANY exception is non-fatal.
    console.warn(
      `[google-trends-client] fetchDailyTrends failed (non-fatal): ${(err as Error).message}`
    );
    return [];
  }
}

/**
 * "200K+" → 90, "50K+" → 70, "10K+" → 50, "5K+" → 30, fallback 20.
 * Heuristic — google-trends-api does not expose the raw integer.
 */
function normalizeTraffic(formatted: string | undefined): number {
  if (!formatted) return 20;
  const m = formatted.match(/(\d+)([KMB])\+?/);
  if (!m) return 20;
  const n = parseInt(m[1], 10);
  const scale = m[2];
  if (scale === "M") return 100;
  if (scale === "B") return 100;
  if (scale === "K" && n >= 200) return 90;
  if (scale === "K" && n >= 50) return 70;
  if (scale === "K" && n >= 10) return 50;
  return 30;
}
