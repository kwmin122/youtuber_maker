import { describe, it, expect } from "vitest";
import {
  tokenize,
  buildBenchmarkTokenSet,
  computeGapSetDiff,
  computeChannelSetHash,
} from "@/lib/trends/setdiff";

describe("tokenize", () => {
  it("lowercases and NFC-normalizes", () => {
    const t = tokenize("Game Review 게임 리뷰");
    expect(t.has("game")).toBe(true);
    expect(t.has("review")).toBe(true);
    expect(t.has("게임")).toBe(true);
    expect(t.has("리뷰")).toBe(true);
  });

  it("drops Korean stop words", () => {
    const t = tokenize("나는 너를 본다");
    expect(t.has("나")).toBe(false);
    expect(t.has("는")).toBe(false);
    expect(t.has("를")).toBe(false);
    expect(t.has("본다")).toBe(true);
  });

  it("drops tokens shorter than 2 chars", () => {
    const t = tokenize("a b cd");
    expect(t.has("a")).toBe(false);
    expect(t.has("b")).toBe(false);
    expect(t.has("cd")).toBe(true);
  });
});

describe("buildBenchmarkTokenSet", () => {
  it("combines title + description across channels", () => {
    const set = buildBenchmarkTokenSet([
      { title: "요리 채널", description: "매일 레시피 공유" },
      { title: "뷰티 채널", description: null },
    ]);
    expect(set.has("요리")).toBe(true);
    expect(set.has("레시피")).toBe(true);
    expect(set.has("뷰티")).toBe(true);
  });
});

describe("computeGapSetDiff", () => {
  const snapshots = [
    { keyword: "게임", categoryId: 20, rank: 1, source: "youtube" as const },
    { keyword: "요리", categoryId: 26, rank: 2, source: "youtube" as const },
    { keyword: "댄스", categoryId: 24, rank: 3, source: "youtube" as const },
    { keyword: "게임", categoryId: 20, rank: 4, source: "youtube" as const }, // dup
  ];

  it("returns only keywords not in benchmark token set", () => {
    const benchmark = new Set(["요리", "레시피"]);
    const gap = computeGapSetDiff(snapshots, benchmark);
    const kws = gap.map((g) => g.keyword);
    expect(kws).toContain("게임");
    expect(kws).toContain("댄스");
    expect(kws).not.toContain("요리");
  });

  it("deduplicates by keyword, first-occurrence wins", () => {
    const benchmark = new Set<string>();
    const gap = computeGapSetDiff(snapshots, benchmark);
    const kws = gap.map((g) => g.keyword);
    expect(kws.filter((k) => k === "게임")).toHaveLength(1);
    // First occurrence is rank 1
    expect(gap.find((g) => g.keyword === "게임")?.rank).toBe(1);
  });

  it("caps at topN", () => {
    const benchmark = new Set<string>();
    const gap = computeGapSetDiff(snapshots, benchmark, 2);
    expect(gap).toHaveLength(2);
  });
});

describe("computeChannelSetHash", () => {
  it("is deterministic regardless of input order", () => {
    const a = computeChannelSetHash(["ch-1", "ch-2", "ch-3"]);
    const b = computeChannelSetHash(["ch-3", "ch-1", "ch-2"]);
    expect(a).toBe(b);
  });

  it("changes when a channel is added", () => {
    const a = computeChannelSetHash(["ch-1", "ch-2"]);
    const b = computeChannelSetHash(["ch-1", "ch-2", "ch-3"]);
    expect(a).not.toBe(b);
  });
});
