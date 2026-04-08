import { describe, it, expect } from "vitest";
import {
  calcPerformanceScore,
  calcEngagementRate,
  calcCII,
} from "@/lib/youtube/metrics";

describe("calcPerformanceScore", () => {
  it("calculates views / subscribers", () => {
    expect(calcPerformanceScore(10000, 5000)).toBe(2);
  });

  it("returns 0 for zero subscribers", () => {
    expect(calcPerformanceScore(10000, 0)).toBe(0);
  });

  it("returns fractional score", () => {
    expect(calcPerformanceScore(500, 10000)).toBe(0.05);
  });
});

describe("calcEngagementRate", () => {
  it("calculates (likes+comments)/views*100", () => {
    expect(calcEngagementRate(100, 50, 10000)).toBe(1.5);
  });

  it("returns 0 for zero views", () => {
    expect(calcEngagementRate(100, 50, 0)).toBe(0);
  });
});

describe("calcCII", () => {
  it("calculates (avgViews * avgEngagement) / subscribers", () => {
    const cii = calcCII(50000, 2.5, 100000);
    expect(cii).toBe(1.25);
  });

  it("returns 0 for zero subscribers", () => {
    expect(calcCII(50000, 2.5, 0)).toBe(0);
  });
});
