"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AudioTrackManager } from "@/components/video/audio-track-manager";
import { useAudioTracks } from "@/hooks/use-audio-tracks";
import {
  Play,
  Pause,
  RefreshCw,
  Loader2,
  ChevronRight,
  Mic,
} from "lucide-react";

interface VoiceTabScene {
  id: string;
  sceneIndex: number;
  narration: string;
  audioUrl?: string;
}

interface VoiceTabProps {
  projectId: string;
  scriptId: string;
  scenes: VoiceTabScene[];
  onNextTab?: () => void;
}

export function VoiceTab({
  projectId,
  scriptId: _scriptId,
  scenes,
  onNextTab,
}: VoiceTabProps) {
  const { tracks, fetchTracks, addTrack, updateTrack, removeTrack } =
    useAudioTracks(projectId);
  const [playingSceneId, setPlayingSceneId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchTracks();
  }, [fetchTracks]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioEl?.pause();
    };
  }, [audioEl]);

  const handlePlayScene = useCallback(
    (scene: VoiceTabScene) => {
      if (playingSceneId === scene.id) {
        audioEl?.pause();
        setPlayingSceneId(null);
        return;
      }

      if (!scene.audioUrl) return;

      audioEl?.pause();
      const audio = new Audio(scene.audioUrl);
      audio.onended = () => setPlayingSceneId(null);
      audio.play().catch(() => {});
      setAudioEl(audio);
      setPlayingSceneId(scene.id);
    },
    [playingSceneId, audioEl]
  );

  const handleGenerateAll = useCallback(async () => {
    setGeneratingAll(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tts/generate-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("TTS generation failed");
    } catch {
      // Error handled silently; user can retry
    } finally {
      setGeneratingAll(false);
    }
  }, [projectId]);

  return (
    <div className="space-y-6">
      {/* TTS Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mic className="h-4 w-4" />
              나레이션 음성
            </CardTitle>
            <Button
              size="sm"
              onClick={handleGenerateAll}
              disabled={generatingAll}
            >
              {generatingAll ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              전체 TTS 생성
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {scenes.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">
              장면이 없습니다. 먼저 대본을 장면으로 분할해주세요.
            </p>
          ) : (
            scenes.map((scene) => (
              <div
                key={scene.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                {/* Scene index */}
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                  {scene.sceneIndex + 1}
                </span>

                {/* Narration text */}
                <p className="flex-1 min-w-0 truncate text-sm">
                  {scene.narration}
                </p>

                {/* TTS status */}
                <Badge variant={scene.audioUrl ? "default" : "secondary"}>
                  {scene.audioUrl ? "생성됨" : "대기"}
                </Badge>

                {/* Play button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={!scene.audioUrl}
                  onClick={() => handlePlayScene(scene)}
                >
                  {playingSceneId === scene.id ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Audio Track Section */}
      <Card>
        <CardContent className="pt-6">
          <AudioTrackManager
            projectId={projectId}
            tracks={tracks}
            onAddTrack={addTrack}
            onUpdateTrack={updateTrack}
            onRemoveTrack={removeTrack}
          />
        </CardContent>
      </Card>

      {/* Next Step */}
      {onNextTab && (
        <div className="flex justify-end">
          <Button onClick={onNextTab}>
            다음: 최종 영상
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
