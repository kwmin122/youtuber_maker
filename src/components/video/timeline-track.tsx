"use client";

import { cn } from "@/lib/utils";
import { Volume2 } from "lucide-react";

interface TimelineTrackProps {
  id: string;
  name: string;
  type: "bgm" | "sfx";
  startTime: number;
  endTime: number | null;
  volume: number;
  totalDuration: number;
  pixelsPerSecond: number;
  isSelected?: boolean;
  onClick?: () => void;
}

export function TimelineTrack({
  name,
  type,
  startTime,
  endTime,
  volume,
  totalDuration,
  pixelsPerSecond,
  isSelected,
  onClick,
}: TimelineTrackProps) {
  const trackEnd = endTime ?? totalDuration;
  const trackWidth = (trackEnd - startTime) * pixelsPerSecond;
  const leftOffset = startTime * pixelsPerSecond;

  return (
    <div
      className="relative h-8"
      style={{ width: `${totalDuration * pixelsPerSecond}px` }}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "absolute top-0 flex h-full items-center gap-1 rounded px-2 text-[10px] font-medium text-white transition-colors",
          type === "bgm"
            ? "bg-blue-500/80 hover:bg-blue-500"
            : "bg-green-500/80 hover:bg-green-500",
          isSelected && "ring-2 ring-white"
        )}
        style={{ left: `${leftOffset}px`, width: `${trackWidth}px`, minWidth: "40px" }}
      >
        <Volume2 className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{name}</span>
        <span className="ml-auto flex-shrink-0 opacity-70">
          {Math.round(volume * 100)}%
        </span>
      </button>
    </div>
  );
}
