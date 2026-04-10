// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: refreshMock }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Stub the child projects list to isolate the client behavior and
// avoid extra fetches that complicate assertions.
vi.mock("@/components/longform/child-projects-list", () => ({
  ChildProjectsList: () => null,
}));

import { LongformDetailClient } from "@/components/longform/longform-detail-client";
import type { LongformPollingState } from "@/hooks/use-longform-polling";

const candidate = {
  id: "cand-1",
  startMs: 0,
  endMs: 30000,
  hookScore: 85,
  emotionalScore: 75,
  informationDensity: 65,
  trendScore: 80,
  reason: "Great hook",
  titleSuggestion: "좋은 클립",
  transcriptSnippet: null,
  selected: false,
  childProjectId: null,
};

const analyzedState: LongformPollingState = {
  source: {
    id: "src-1",
    title: "Example source",
    durationSeconds: 600,
    status: "analyzed",
    errorMessage: null,
    publicUrl: null,
    sourceType: "url",
    sourceUrl: "https://youtube.com/watch?v=abc",
  },
  candidates: [candidate],
  latestJob: null,
};

describe("LongformDetailClient", () => {
  beforeEach(() => {
    refreshMock.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ jobId: "job-1", count: 1 }),
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders candidates and triggers auto-clip-all", async () => {
    render(
      <LongformDetailClient
        sourceId="src-1"
        initialState={analyzedState}
      />
    );

    expect(screen.getByText(/1개 후보/)).toBeInTheDocument();
    expect(screen.getByText("좋은 클립")).toBeInTheDocument();

    const autoClip = screen.getByRole("button", { name: /전체 자동 클립/ });
    fireEvent.click(autoClip);

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url]) => url === "/api/longform/candidates/clip"
      );
      expect(call).toBeDefined();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body).toEqual({ mode: "all", sourceId: "src-1" });
    });
  });

  it("sends only selected candidate ids when clicking 선택 클립", async () => {
    const state: LongformPollingState = {
      ...analyzedState,
      candidates: [
        candidate,
        { ...candidate, id: "cand-2", titleSuggestion: "두 번째" },
      ],
    };
    render(
      <LongformDetailClient sourceId="src-1" initialState={state} />
    );

    // Select the first candidate.
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);

    const button = await screen.findByRole("button", {
      name: /선택한 1개 클립/,
    });
    fireEvent.click(button);

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url]) => url === "/api/longform/candidates/clip"
      );
      expect(call).toBeDefined();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.mode).toBe("selected");
      expect(body.sourceId).toBe("src-1");
      expect(body.candidateIds).toHaveLength(1);
    });
  });
});
