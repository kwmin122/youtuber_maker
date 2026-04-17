// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TrendDashboard } from "@/components/trends/trend-dashboard";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeTrendsResponse(overrides?: {
  lastRunEndedAt?: string | null;
  keywords?: string[];
}) {
  return {
    latestDate: "2026-04-11",
    lastRun: {
      endedAt: overrides?.lastRunEndedAt ?? new Date().toISOString(),
      status: "completed",
      partial: false,
    },
    categories: {
      20: (overrides?.keywords ?? ["게임", "리뷰"]).map((kw, i) => ({
        keyword: kw,
        rank: i + 1,
        source: "youtube",
        recordedAt: new Date().toISOString(),
      })),
    },
    categoryLabels: { 20: "게임" },
  };
}

describe("TrendDashboard", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("renders category tabs and keyword list", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeTrendsResponse({ keywords: ["게임", "리뷰"] }),
    });

    render(<TrendDashboard />);
    await waitFor(() => expect(screen.getByRole("tablist")).toBeInTheDocument());

    expect(screen.getByRole("tab", { name: "게임" })).toBeInTheDocument();
    // "게임" appears as both tab label and keyword — at least one match is sufficient
    expect(screen.getAllByText("게임").length).toBeGreaterThan(0);
    expect(screen.getByText("리뷰")).toBeInTheDocument();
  });

  it("shows stale banner when lastRun.endedAt is >8h ago", async () => {
    const staleTime = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeTrendsResponse({ lastRunEndedAt: staleTime }),
    });

    render(<TrendDashboard />);
    await waitFor(() =>
      expect(
        screen.getByRole("alert", { name: "stale-banner" })
      ).toBeInTheDocument()
    );
  });

  it("does not show stale banner when data is fresh (<8h)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeTrendsResponse(),
    });

    render(<TrendDashboard />);
    await waitFor(() => expect(screen.getByRole("tablist")).toBeInTheDocument());

    expect(
      screen.queryByRole("alert", { name: "stale-banner" })
    ).not.toBeInTheDocument();
  });
});
