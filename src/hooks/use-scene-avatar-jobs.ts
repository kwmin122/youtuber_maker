"use client";

import { useEffect, useRef, useState } from "react";

export type SceneAvatarProgress = {
  status: string;
  progress: number;
};

/** Map of sceneId → latest job progress */
export type SceneAvatarProgressMap = Record<string, SceneAvatarProgress>;

/**
 * Polls GET /api/avatar/scene-progress?projectId=<id> every `intervalMs`
 * (default 3000 ms) and returns the latest progress map.
 *
 * Cleans up the interval on unmount.
 */
export function useSceneAvatarJobs(
  projectId: string,
  options: { intervalMs?: number } = {}
) {
  const intervalMs = options.intervalMs ?? 3000;
  const [progressMap, setProgressMap] = useState<SceneAvatarProgressMap>({});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(
          `/api/avatar/scene-progress?projectId=${encodeURIComponent(projectId)}`,
          { cache: "no-store", credentials: "include" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as SceneAvatarProgressMap;
        if (!cancelled && mounted.current) {
          setProgressMap(data);
        }
      } catch {
        // swallow — next tick will retry
      }
    };

    const id = setInterval(tick, intervalMs);
    // Fire immediately on mount so we don't wait for the first interval
    tick();

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId, intervalMs]);

  return { progressMap };
}
