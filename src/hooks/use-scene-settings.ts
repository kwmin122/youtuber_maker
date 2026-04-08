"use client";

import { useState, useCallback } from "react";
import type { SubtitleStyle, TransitionType } from "@/lib/video/types";
import { DEFAULT_SUBTITLE_STYLE } from "@/lib/video/types";

interface SceneSettings {
  subtitleStyle: SubtitleStyle;
  transitionType: TransitionType;
  transitionDuration: number;
}

export function useSceneSettings(projectId: string, sceneId: string) {
  const [settings, setSettings] = useState<SceneSettings>({
    subtitleStyle: DEFAULT_SUBTITLE_STYLE,
    transitionType: "cut",
    transitionDuration: 0.5,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Fetch current subtitle/transition settings from API */
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, transRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/scenes/${sceneId}/subtitle`),
        fetch(`/api/projects/${projectId}/scenes/${sceneId}/transition`),
      ]);
      if (subRes.ok) {
        const subData = await subRes.json();
        setSettings((prev) => ({
          ...prev,
          subtitleStyle: subData.subtitleStyle || DEFAULT_SUBTITLE_STYLE,
        }));
      }
      if (transRes.ok) {
        const transData = await transRes.json();
        setSettings((prev) => ({
          ...prev,
          transitionType: transData.transitionType || "cut",
          transitionDuration: transData.transitionDuration || 0.5,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [projectId, sceneId]);

  /** Update subtitle style */
  const updateSubtitle = useCallback(
    async (style: SubtitleStyle) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/scenes/${sceneId}/subtitle`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(style),
          }
        );
        if (!res.ok) throw new Error("Failed to update subtitle");
        setSettings((prev) => ({ ...prev, subtitleStyle: style }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed");
      } finally {
        setLoading(false);
      }
    },
    [projectId, sceneId]
  );

  /** Update transition */
  const updateTransition = useCallback(
    async (type: TransitionType, duration: number) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/scenes/${sceneId}/transition`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transitionType: type,
              transitionDuration: duration,
            }),
          }
        );
        if (!res.ok) throw new Error("Failed to update transition");
        setSettings((prev) => ({
          ...prev,
          transitionType: type,
          transitionDuration: duration,
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed");
      } finally {
        setLoading(false);
      }
    },
    [projectId, sceneId]
  );

  return {
    settings,
    loading,
    error,
    fetchSettings,
    updateSubtitle,
    updateTransition,
  };
}
