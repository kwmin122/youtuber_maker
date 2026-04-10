import { describe, it, expect } from "vitest";
import { parseAndValidateCandidates } from "@/lib/longform/segment-validator";

function makeCandidate(overrides: Record<string, unknown> = {}) {
  return {
    startMs: 0,
    endMs: 45_000,
    hookScore: 80,
    emotionalScore: 70,
    informationDensity: 60,
    trendScore: 50,
    reason: "Great opener",
    titleSuggestion: "Wait what?",
    transcriptSnippet: "This is the opening segment.",
    ...overrides,
  };
}

function wrap(candidates: unknown[]): string {
  return JSON.stringify({ candidates });
}

describe("parseAndValidateCandidates", () => {
  it("parses a well-formed response", () => {
    const raw = wrap([makeCandidate()]);
    const result = parseAndValidateCandidates(raw, {
      targetCount: 5,
      sourceDurationSeconds: 600,
    });
    expect(result).toHaveLength(1);
    expect(result[0].startMs).toBe(0);
    expect(result[0].endMs).toBe(45_000);
    expect(result[0].reason).toBe("Great opener");
  });

  it("tolerates ```json fenced responses", () => {
    const raw = "```json\n" + wrap([makeCandidate()]) + "\n```";
    const result = parseAndValidateCandidates(raw, {
      targetCount: 5,
      sourceDurationSeconds: 600,
    });
    expect(result).toHaveLength(1);
  });

  it("clamps scores outside 0-100 to valid range", () => {
    const raw = wrap([
      makeCandidate({
        hookScore: 150,
        emotionalScore: -20,
        informationDensity: 9999,
        trendScore: -1,
      }),
    ]);
    const result = parseAndValidateCandidates(raw, {
      targetCount: 5,
      sourceDurationSeconds: 600,
    });
    expect(result[0].hookScore).toBe(100);
    expect(result[0].emotionalScore).toBe(0);
    expect(result[0].informationDensity).toBe(100);
    expect(result[0].trendScore).toBe(0);
  });

  it("drops candidates shorter than 30s when they can't be extended", () => {
    const raw = wrap([
      makeCandidate({ startMs: 0, endMs: 10_000 }),
    ]);
    const result = parseAndValidateCandidates(raw, {
      targetCount: 5,
      sourceDurationSeconds: 20, // source is only 20s, can't extend
    });
    expect(result).toHaveLength(0);
  });

  it("extends candidates shorter than 30s when source allows", () => {
    const raw = wrap([
      makeCandidate({ startMs: 0, endMs: 10_000 }),
    ]);
    const result = parseAndValidateCandidates(raw, {
      targetCount: 5,
      sourceDurationSeconds: 600,
    });
    expect(result).toHaveLength(1);
    expect(result[0].endMs - result[0].startMs).toBe(30_000);
  });

  it("trims candidates longer than 60s", () => {
    const raw = wrap([
      makeCandidate({ startMs: 0, endMs: 120_000 }),
    ]);
    const result = parseAndValidateCandidates(raw, {
      targetCount: 5,
      sourceDurationSeconds: 600,
    });
    expect(result).toHaveLength(1);
    expect(result[0].endMs - result[0].startMs).toBe(60_000);
  });

  it("drops overlapping segments, keeping higher total score", () => {
    const raw = wrap([
      makeCandidate({
        startMs: 0,
        endMs: 45_000,
        hookScore: 50,
        emotionalScore: 50,
        informationDensity: 50,
        trendScore: 50, // total 200
      }),
      makeCandidate({
        startMs: 30_000,
        endMs: 75_000,
        hookScore: 90,
        emotionalScore: 90,
        informationDensity: 90,
        trendScore: 90, // total 360 -- stronger, should win
      }),
      makeCandidate({
        startMs: 100_000,
        endMs: 145_000,
        hookScore: 60,
        emotionalScore: 60,
        informationDensity: 60,
        trendScore: 60,
      }),
    ]);
    const result = parseAndValidateCandidates(raw, {
      targetCount: 5,
      sourceDurationSeconds: 600,
    });
    expect(result).toHaveLength(2);
    // The surviving overlap candidate should be the stronger one
    const survivors = result.map((r) => r.startMs).sort((a, b) => a - b);
    expect(survivors).toEqual([30_000, 100_000]);
  });

  it("truncates to targetCount", () => {
    const raw = wrap(
      Array.from({ length: 10 }, (_, i) =>
        makeCandidate({
          startMs: i * 70_000,
          endMs: i * 70_000 + 45_000,
        })
      )
    );
    const result = parseAndValidateCandidates(raw, {
      targetCount: 3,
      sourceDurationSeconds: 1000,
    });
    expect(result).toHaveLength(3);
  });

  it("returns results sorted chronologically", () => {
    const raw = wrap([
      makeCandidate({ startMs: 300_000, endMs: 345_000 }),
      makeCandidate({ startMs: 0, endMs: 45_000 }),
      makeCandidate({ startMs: 150_000, endMs: 195_000 }),
    ]);
    const result = parseAndValidateCandidates(raw, {
      targetCount: 5,
      sourceDurationSeconds: 600,
    });
    expect(result.map((r) => r.startMs)).toEqual([0, 150_000, 300_000]);
  });

  it("handles missing optional string fields", () => {
    const raw = wrap([
      {
        startMs: 0,
        endMs: 45_000,
        hookScore: 80,
        emotionalScore: 70,
        informationDensity: 60,
        trendScore: 50,
      },
    ]);
    const result = parseAndValidateCandidates(raw, {
      targetCount: 5,
      sourceDurationSeconds: 600,
    });
    expect(result[0].reason).toBe("");
    expect(result[0].titleSuggestion).toBe("");
    expect(result[0].transcriptSnippet).toBe("");
  });

  it("truncates oversized string fields", () => {
    const longReason = "A".repeat(5000);
    const raw = wrap([makeCandidate({ reason: longReason })]);
    const result = parseAndValidateCandidates(raw, {
      targetCount: 5,
      sourceDurationSeconds: 600,
    });
    expect(result[0].reason.length).toBe(1000);
  });

  it("throws on invalid JSON", () => {
    expect(() =>
      parseAndValidateCandidates("not json", {
        targetCount: 5,
        sourceDurationSeconds: 600,
      })
    ).toThrow(/Gemini JSON parse failed/);
  });

  it("throws when 'candidates' is missing", () => {
    expect(() =>
      parseAndValidateCandidates(JSON.stringify({ foo: "bar" }), {
        targetCount: 5,
        sourceDurationSeconds: 600,
      })
    ).toThrow(/missing 'candidates'/);
  });
});
