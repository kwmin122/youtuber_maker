import { describe, it, expect, vi, beforeEach } from "vitest";

describe("fetchDailyTrends — feature flag + non-fatal", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns [] when GOOGLE_TRENDS_ENABLED is false (no import)", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { GOOGLE_TRENDS_ENABLED: false },
    }));
    // If the module attempts to import google-trends-api despite the flag,
    // this mock will throw loudly.
    vi.doMock("google-trends-api", () => {
      throw new Error("MUST NOT IMPORT WHEN FLAG IS FALSE");
    });
    const { fetchDailyTrends } = await import("@/lib/trends/google-trends-client");
    const r = await fetchDailyTrends({ geo: "KR" });
    expect(r).toEqual([]);
  });

  it("returns parsed keywords on happy path", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { GOOGLE_TRENDS_ENABLED: true },
    }));
    const fakePayload = JSON.stringify({
      default: {
        trendingSearchesDays: [
          {
            trendingSearches: [
              { title: { query: "키워드1" }, formattedTraffic: "200K+" },
              { title: { query: "키워드2" }, formattedTraffic: "50K+" },
            ],
          },
        ],
      },
    });
    vi.doMock("google-trends-api", () => ({
      default: { dailyTrends: vi.fn().mockResolvedValue(fakePayload) },
      dailyTrends: vi.fn().mockResolvedValue(fakePayload),
    }));
    const { fetchDailyTrends } = await import("@/lib/trends/google-trends-client");
    const r = await fetchDailyTrends({ geo: "KR" });
    expect(r).toHaveLength(2);
    expect(r[0].keyword).toBe("키워드1");
    expect(r[0].score).toBeGreaterThanOrEqual(70);
  });

  it("returns [] on dynamic-import throw (non-fatal)", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { GOOGLE_TRENDS_ENABLED: true },
    }));
    vi.doMock("google-trends-api", () => {
      throw new Error("simulated package load failure");
    });
    const { fetchDailyTrends } = await import("@/lib/trends/google-trends-client");
    const r = await fetchDailyTrends({ geo: "KR" });
    expect(r).toEqual([]);
  });
});
