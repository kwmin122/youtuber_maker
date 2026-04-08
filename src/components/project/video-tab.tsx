"use client";

import { useState, useEffect, useCallback } from "react";
import type { SubtitleStyle, TransitionType } from "@/lib/video/types";
import { DEFAULT_SUBTITLE_STYLE } from "@/lib/video/types";
import { VideoPreview } from "@/components/video/video-preview";
import { Timeline } from "@/components/video/timeline";
import { SubtitleEditor } from "@/components/video/subtitle-editor";
import { TransitionPicker } from "@/components/video/transition-picker";
import { ExportButton } from "@/components/video/export-button";
import { useSceneSettings } from "@/hooks/use-scene-settings";
import { useAudioTracks } from "@/hooks/use-audio-tracks";
import { Loader2 } from "lucide-react";

interface VideoTabProps {
  projectId: string;
  scriptId: string;
}

interface SceneData {
  id: string;
  sceneIndex: number;
  narration: string;
  duration: number;
  subtitleStyle: SubtitleStyle | null;
  transitionType: TransitionType;
  transitionDuration: number;
  mediaUrl: string;
  mediaType: "image" | "video";
  audioUrl?: string;
  thumbnailUrl?: string;
}

export function VideoTab({ projectId, scriptId }: VideoTabProps) {
  const [scenes, setScenes] = useState<SceneData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);

  const selectedScene = scenes.find((s) => s.id === selectedSceneId);

  const {
    settings,
    fetchSettings,
    updateSubtitle,
    updateTransition,
  } = useSceneSettings(
    projectId,
    selectedSceneId ?? ""
  );

  const { tracks, fetchTracks } = useAudioTracks(projectId);

  // Fetch scenes on mount
  useEffect(() => {
    async function loadScenes() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/scenes?scriptId=${scriptId}`
        );
        if (!res.ok) throw new Error("Failed to fetch scenes");
        const data = await res.json();
        const sceneList: SceneData[] = (data.scenes ?? data ?? []).map(
          (s: Record<string, unknown>) => ({
            id: s.id as string,
            sceneIndex: (s.sceneIndex ?? 0) as number,
            narration: (s.narration ?? "") as string,
            duration: (s.duration ?? 3) as number,
            subtitleStyle: (s.subtitleStyle as SubtitleStyle | null) ?? null,
            transitionType: ((s.transitionType as string) ?? "cut") as TransitionType,
            transitionDuration: (s.transitionDuration ?? 0.5) as number,
            mediaUrl: (s.mediaUrl ?? s.thumbnailUrl ?? "") as string,
            mediaType: ((s.mediaType as string) ?? "image") as "image" | "video",
            audioUrl: (s.audioUrl as string) ?? undefined,
            thumbnailUrl: (s.thumbnailUrl as string) ?? undefined,
          })
        );
        setScenes(sceneList);
        if (sceneList.length > 0 && !selectedSceneId) {
          setSelectedSceneId(sceneList[0].id);
        }
      } catch {
        // Error handled silently
      } finally {
        setLoading(false);
      }
    }
    loadScenes();
    fetchTracks();
  }, [projectId, scriptId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch settings when scene changes
  useEffect(() => {
    if (selectedSceneId) {
      fetchSettings();
    }
  }, [selectedSceneId, fetchSettings]);

  const handleSubtitleChange = useCallback(
    (style: SubtitleStyle) => {
      updateSubtitle(style);
      // Update local scene data
      setScenes((prev) =>
        prev.map((s) =>
          s.id === selectedSceneId ? { ...s, subtitleStyle: style } : s
        )
      );
    },
    [selectedSceneId, updateSubtitle]
  );

  const handleTransitionChange = useCallback(
    (type: TransitionType, duration: number) => {
      updateTransition(type, duration);
      // Update local scene data
      setScenes((prev) =>
        prev.map((s) =>
          s.id === selectedSceneId
            ? { ...s, transitionType: type, transitionDuration: duration }
            : s
        )
      );
    },
    [selectedSceneId, updateTransition]
  );

  const handleExportComplete = useCallback((url: string) => {
    setExportedVideoUrl(url);
  }, []);

  const totalDuration = scenes.reduce(
    (sum, s) => sum + (s.duration || 3),
    0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Empty state
  if (scenes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">
          먼저 대본을 장면으로 분할해주세요
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          2. 장면/이미지 탭에서 장면을 생성할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top section: Preview + Edit Panel */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Video Preview */}
        <div className="flex justify-center">
          <VideoPreview
            scenes={scenes}
            exportedVideoUrl={exportedVideoUrl}
          />
        </div>

        {/* Right: Edit Panel */}
        <div className="space-y-6">
          {selectedScene ? (
            <>
              <div className="text-xs text-muted-foreground">
                선택된 장면: #{selectedScene.sceneIndex + 1}
              </div>

              {/* Subtitle Editor */}
              <SubtitleEditor
                sceneId={selectedScene.id}
                narrationText={selectedScene.narration}
                style={
                  settings.subtitleStyle ??
                  selectedScene.subtitleStyle ??
                  DEFAULT_SUBTITLE_STYLE
                }
                onStyleChange={handleSubtitleChange}
              />

              {/* Transition Picker */}
              <TransitionPicker
                sceneId={selectedScene.id}
                currentType={
                  settings.transitionType ?? selectedScene.transitionType
                }
                currentDuration={
                  settings.transitionDuration ??
                  selectedScene.transitionDuration
                }
                onTransitionChange={handleTransitionChange}
              />
            </>
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed p-8">
              <p className="text-sm text-muted-foreground">
                타임라인에서 장면을 선택하세요
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <Timeline
        scenes={scenes.map((s) => ({
          id: s.id,
          sceneIndex: s.sceneIndex,
          narration: s.narration,
          duration: s.duration || 3,
          thumbnailUrl: s.thumbnailUrl,
          transitionType: s.transitionType,
        }))}
        audioTracks={tracks.map((t) => ({
          id: t.id,
          name: t.name,
          type: t.type,
          startTime: t.startTime,
          endTime: t.endTime,
          volume: t.volume,
        }))}
        totalDuration={totalDuration}
        selectedSceneId={selectedSceneId}
        onSceneSelect={setSelectedSceneId}
      />

      {/* Export Button */}
      <ExportButton
        projectId={projectId}
        disabled={scenes.length === 0}
        onExportComplete={handleExportComplete}
      />
    </div>
  );
}
