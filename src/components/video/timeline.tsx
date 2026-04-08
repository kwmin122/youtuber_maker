"use client";

import { useRef, useState } from "react";
import { SceneClip } from "./scene-clip";
import { TimelineTrack } from "./timeline-track";
import {
  ArrowLeftRight,
  Blend,
  MoveLeft,
  MoveRight,
  ZoomIn,
  Scissors,
} from "lucide-react";

interface TimelineScene {
  id: string;
  sceneIndex: number;
  narration: string;
  duration: number;
  thumbnailUrl?: string;
  transitionType: string;
}

interface TimelineAudioTrack {
  id: string;
  name: string;
  type: "bgm" | "sfx";
  startTime: number;
  endTime: number | null;
  volume: number;
}

interface TimelineProps {
  scenes: TimelineScene[];
  audioTracks: TimelineAudioTrack[];
  totalDuration: number;
  selectedSceneId: string | null;
  onSceneSelect: (sceneId: string) => void;
  onSceneReorder?: (fromIndex: number, toIndex: number) => void;
  pixelsPerSecond?: number;
}

const TRANSITION_ICONS: Record<string, typeof Blend> = {
  fade: Blend,
  dissolve: ArrowLeftRight,
  "slide-left": MoveLeft,
  "slide-right": MoveRight,
  "zoom-in": ZoomIn,
  cut: Scissors,
};

function TimeRuler({
  totalDuration,
  pixelsPerSecond,
}: {
  totalDuration: number;
  pixelsPerSecond: number;
}) {
  const ticks: { position: number; label: string | null }[] = [];
  for (let t = 0; t <= totalDuration; t += 1) {
    ticks.push({
      position: t * pixelsPerSecond,
      label: t % 5 === 0 ? `${t}s` : null,
    });
  }

  return (
    <div
      className="relative h-6 border-b border-border bg-muted/30"
      style={{ width: `${totalDuration * pixelsPerSecond}px` }}
    >
      {ticks.map((tick) => (
        <div
          key={tick.position}
          className="absolute top-0 flex flex-col items-center"
          style={{ left: `${tick.position}px` }}
        >
          <div
            className={`w-px ${tick.label ? "h-4 bg-foreground/50" : "h-2 bg-foreground/20"}`}
          />
          {tick.label && (
            <span className="text-[9px] text-muted-foreground">
              {tick.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function Timeline({
  scenes,
  audioTracks,
  totalDuration,
  selectedSceneId,
  onSceneSelect,
  pixelsPerSecond = 40,
}: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const totalWidth = totalDuration * pixelsPerSecond;

  function handleRulerClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (containerRef.current?.scrollLeft ?? 0);
    const time = x / pixelsPerSecond;
    setCurrentTime(Math.max(0, Math.min(time, totalDuration)));
  }

  return (
    <div className="rounded-lg border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          타임라인
        </span>
        <span className="text-xs text-muted-foreground">
          {totalDuration.toFixed(1)}초
        </span>
      </div>

      {/* Scrollable timeline area */}
      <div ref={containerRef} className="overflow-x-auto">
        <div style={{ width: `${totalWidth}px`, minWidth: "100%" }}>
          {/* Time ruler */}
          <div onClick={handleRulerClick} className="cursor-crosshair">
            <TimeRuler
              totalDuration={totalDuration}
              pixelsPerSecond={pixelsPerSecond}
            />
          </div>

          {/* Current time indicator */}
          <div className="relative" style={{ width: `${totalWidth}px` }}>
            <div
              className="pointer-events-none absolute top-0 z-20 w-0.5 bg-red-500"
              style={{
                left: `${currentTime * pixelsPerSecond}px`,
                height: "100%",
              }}
            />

            {/* Video track (scenes) */}
            <div className="flex items-center gap-0 border-b border-border px-1 py-1.5">
              {scenes.map((scene, idx) => (
                <div key={scene.id} className="flex items-center">
                  <SceneClip
                    id={scene.id}
                    sceneIndex={scene.sceneIndex}
                    narration={scene.narration}
                    duration={scene.duration}
                    thumbnailUrl={scene.thumbnailUrl}
                    transitionType={scene.transitionType}
                    isSelected={selectedSceneId === scene.id}
                    pixelsPerSecond={pixelsPerSecond}
                    onClick={() => onSceneSelect(scene.id)}
                  />
                  {/* Transition indicator between clips */}
                  {idx < scenes.length - 1 &&
                    scenes[idx + 1]?.transitionType !== "cut" && (
                      <div className="mx-0.5 flex h-6 w-6 items-center justify-center rounded bg-muted">
                        {(() => {
                          const nextTransition =
                            scenes[idx + 1]?.transitionType ?? "cut";
                          const Icon =
                            TRANSITION_ICONS[nextTransition] ?? Scissors;
                          return (
                            <Icon className="h-3 w-3 text-muted-foreground" />
                          );
                        })()}
                      </div>
                    )}
                </div>
              ))}
            </div>

            {/* Audio tracks */}
            {audioTracks.length > 0 && (
              <div className="space-y-1 px-1 py-1.5">
                {audioTracks.map((track) => (
                  <TimelineTrack
                    key={track.id}
                    id={track.id}
                    name={track.name}
                    type={track.type}
                    startTime={track.startTime}
                    endTime={track.endTime}
                    volume={track.volume}
                    totalDuration={totalDuration}
                    pixelsPerSecond={pixelsPerSecond}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
