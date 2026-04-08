"use client";

// Vidstack web component type declarations for React 19
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "media-player": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { src?: string },
        HTMLElement
      >;
      "media-provider": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}

import { useState, useEffect, useRef, useCallback } from "react";
import type { SubtitleStyle } from "@/lib/video/types";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize2,
} from "lucide-react";
// vidstack - video player (web component import for side-effect registration)
import "vidstack/define/media-player.js";
import "vidstack/define/media-provider.js";

interface VideoPreviewScene {
  id: string;
  sceneIndex: number;
  narration: string;
  duration: number;
  mediaUrl: string;
  mediaType: "image" | "video";
  audioUrl?: string;
  subtitleStyle: SubtitleStyle | null;
}

interface VideoPreviewProps {
  scenes: VideoPreviewScene[];
  exportedVideoUrl?: string | null;
  onTimeUpdate?: (currentTime: number) => void;
}

function getSubtitlePositionStyle(
  position: SubtitleStyle["position"]
): React.CSSProperties {
  switch (position) {
    case "top":
      return { top: "10%", left: "50%", transform: "translateX(-50%)" };
    case "center":
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    case "bottom":
    default:
      return { bottom: "15%", left: "50%", transform: "translateX(-50%)" };
  }
}

export function VideoPreview({
  scenes,
  exportedVideoUrl,
  onTimeUpdate,
}: VideoPreviewProps) {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const elapsedRef = useRef(0);

  const currentScene = scenes[currentSceneIndex];
  const totalScenes = scenes.length;

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Auto-advance to next scene
  useEffect(() => {
    if (!playing || !currentScene) return;

    const duration = (currentScene.duration || 3) * 1000;

    // Play TTS audio if available
    if (currentScene.audioUrl) {
      const audio = new Audio(currentScene.audioUrl);
      audio.play().catch(() => {});
      audioRef.current = audio;
    }

    timerRef.current = setTimeout(() => {
      if (currentSceneIndex < totalScenes - 1) {
        setCurrentSceneIndex((prev) => prev + 1);
        elapsedRef.current += currentScene.duration || 3;
        onTimeUpdate?.(elapsedRef.current);
      } else {
        setPlaying(false);
        elapsedRef.current = 0;
      }
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [playing, currentSceneIndex, currentScene, totalScenes, onTimeUpdate]);

  const togglePlay = useCallback(() => {
    setPlaying((prev) => !prev);
  }, []);

  const goToPrev = useCallback(() => {
    setPlaying(false);
    setCurrentSceneIndex((prev) => Math.max(0, prev - 1));
    elapsedRef.current = 0;
  }, []);

  const goToNext = useCallback(() => {
    setPlaying(false);
    setCurrentSceneIndex((prev) => Math.min(totalScenes - 1, prev + 1));
    elapsedRef.current = 0;
  }, [totalScenes]);

  // Exported video: render vidstack player
  if (exportedVideoUrl) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div
          className="relative mx-auto overflow-hidden rounded-lg bg-black"
          style={{ width: "360px", aspectRatio: "9/16" }}
        >
          <media-player
            src={exportedVideoUrl}
            style={{ width: "100%", height: "100%" }}
          >
            <media-provider />
          </media-player>
        </div>
        <p className="text-xs text-muted-foreground">
          내보낸 영상 미리보기
        </p>
      </div>
    );
  }

  // No scenes
  if (scenes.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-zinc-900 text-zinc-500"
        style={{ width: "360px", aspectRatio: "9/16" }}
      >
        <p className="text-sm">장면이 없습니다</p>
      </div>
    );
  }

  // Scene-by-scene preview
  const subtitle = currentScene?.subtitleStyle;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* 9:16 Preview Canvas */}
      <div
        className="relative mx-auto overflow-hidden rounded-lg bg-zinc-900"
        style={{ width: "360px", aspectRatio: "9/16" }}
      >
        {/* Scene media */}
        {currentScene?.mediaType === "video" ? (
          <video
            key={currentScene.id}
            src={currentScene.mediaUrl}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay={playing}
            muted
            loop
          />
        ) : (
          <img
            key={currentScene?.id}
            src={currentScene?.mediaUrl}
            alt={`Scene ${(currentScene?.sceneIndex ?? 0) + 1}`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {/* Subtitle overlay */}
        {currentScene?.narration && subtitle && (
          <div
            className="absolute max-w-[90%] text-center"
            style={getSubtitlePositionStyle(subtitle.position)}
          >
            <span
              style={{
                fontFamily: subtitle.fontFamily,
                fontSize: `${Math.round(subtitle.fontSize * 0.5)}px`,
                color: subtitle.fontColor,
                backgroundColor: subtitle.backgroundColor,
                padding: "4px 8px",
                borderRadius: "4px",
                WebkitTextStroke:
                  subtitle.borderWidth > 0
                    ? `${subtitle.borderWidth * 0.5}px ${subtitle.borderColor}`
                    : undefined,
                textShadow:
                  subtitle.shadowOffset > 0
                    ? `${subtitle.shadowOffset}px ${subtitle.shadowOffset}px ${subtitle.shadowOffset}px ${subtitle.shadowColor}`
                    : undefined,
              }}
            >
              {currentScene.narration}
            </span>
          </div>
        )}

        {/* Scene indicator */}
        <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
          {(currentScene?.sceneIndex ?? 0) + 1}/{totalScenes}
        </div>

        {/* Fullscreen hint */}
        <button
          type="button"
          className="absolute right-2 top-2 rounded bg-black/60 p-1 text-white/60 hover:text-white"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={goToPrev}
          disabled={currentSceneIndex === 0}
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10"
          onClick={togglePlay}
        >
          {playing ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={goToNext}
          disabled={currentSceneIndex === totalScenes - 1}
        >
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>

      {/* Scene label */}
      <p className="text-xs text-muted-foreground">
        장면 {(currentScene?.sceneIndex ?? 0) + 1} / {totalScenes}
      </p>
    </div>
  );
}
