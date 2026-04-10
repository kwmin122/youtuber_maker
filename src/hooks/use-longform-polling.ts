"use client";

import { useEffect, useRef, useState } from "react";

export type LongformSourceStatus =
  | "pending"
  | "downloading"
  | "analyzing"
  | "ready"
  | "analyzed"
  | "clipping"
  | "failed";

export type LongformSourceSnapshot = {
  id: string;
  title: string | null;
  durationSeconds: number | null;
  status: LongformSourceStatus;
  errorMessage: string | null;
  publicUrl: string | null;
  sourceType: "url" | "file";
  sourceUrl: string | null;
};

export type LongformCandidateSnapshot = {
  id: string;
  startMs: number;
  endMs: number;
  hookScore: number;
  emotionalScore: number;
  informationDensity: number;
  trendScore: number;
  reason: string;
  titleSuggestion: string | null;
  transcriptSnippet: string | null;
  selected: boolean;
  childProjectId: string | null;
};

export type LongformLatestJob = {
  id: string;
  type: string;
  status: string;
  progress: number;
  currentStep: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LongformPollingState = {
  source: LongformSourceSnapshot;
  candidates: LongformCandidateSnapshot[];
  latestJob: LongformLatestJob | null;
};

/**
 * A polling hook for /api/longform/sources/[id].
 *
 * Polls every `intervalMs` (default 3000) while the source is in a
 * non-terminal status. Stops when the status is `failed` or when
 * the status is `ready`/`analyzed` AND candidates exist.
 *
 * Consumers can read `state` for the latest snapshot and `isPolling`
 * for an indicator.
 */
export function useLongformPolling(
  sourceId: string,
  initial: LongformPollingState,
  options: { intervalMs?: number } = {}
) {
  const intervalMs = options.intervalMs ?? 3000;
  const [state, setState] = useState<LongformPollingState>(initial);
  const [isPolling, setIsPolling] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const status = state.source.status;
    const done =
      status === "failed" ||
      ((status === "ready" || status === "analyzed") &&
        state.candidates.length > 0);

    if (done) {
      setIsPolling(false);
      return;
    }
    setIsPolling(true);

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/longform/sources/${sourceId}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as LongformPollingState;
        if (!cancelled && mounted.current) {
          setState(data);
        }
      } catch {
        // swallow — next tick will retry
      }
    };

    const interval = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sourceId, state.source.status, state.candidates.length, intervalMs]);

  return { state, isPolling, setState };
}
