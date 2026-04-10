// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useLongformPolling,
  type LongformPollingState,
} from "@/hooks/use-longform-polling";

function makeState(
  overrides: Partial<LongformPollingState["source"]> = {},
  candidates: LongformPollingState["candidates"] = []
): LongformPollingState {
  return {
    source: {
      id: "src-1",
      title: "Test",
      durationSeconds: 600,
      status: "downloading",
      errorMessage: null,
      publicUrl: null,
      sourceType: "url",
      sourceUrl: "https://youtube.com/watch?v=abc",
      ...overrides,
    },
    candidates,
    latestJob: null,
  };
}

describe("useLongformPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("polls while status is non-terminal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          makeState({ status: "analyzing" }, [])
        ),
    });
    vi.stubGlobal("fetch", fetchMock);

    const initial = makeState({ status: "downloading" });
    const { result } = renderHook(() =>
      useLongformPolling("src-1", initial, { intervalMs: 1000 })
    );

    expect(result.current.isPolling).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/longform/sources/src-1",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("stops polling when status becomes failed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const initial = makeState({ status: "failed" });
    const { result } = renderHook(() =>
      useLongformPolling("src-1", initial, { intervalMs: 500 })
    );

    expect(result.current.isPolling).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops polling when status is ready and candidates exist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const initial = makeState({ status: "analyzed" }, [
      {
        id: "c1",
        startMs: 0,
        endMs: 30000,
        hookScore: 80,
        emotionalScore: 70,
        informationDensity: 60,
        trendScore: 75,
        reason: "",
        titleSuggestion: null,
        transcriptSnippet: null,
        selected: false,
        childProjectId: null,
      },
    ]);
    const { result } = renderHook(() =>
      useLongformPolling("src-1", initial, { intervalMs: 500 })
    );

    expect(result.current.isPolling).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("updates state with the latest fetch response", async () => {
    const updated = makeState({ status: "analyzing" }, []);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(updated),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useLongformPolling(
        "src-1",
        makeState({ status: "downloading" }),
        { intervalMs: 500 }
      )
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    // Flush any pending microtasks from the awaited fetch/json
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.state.source.status).toBe("analyzing");
  });
});
