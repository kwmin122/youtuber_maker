"use client";

import { cn } from "@/lib/utils";

interface SceneClipProps {
  id: string;
  sceneIndex: number;
  narration: string;
  duration: number;
  thumbnailUrl?: string;
  transitionType: string;
  isSelected: boolean;
  pixelsPerSecond: number;
  onClick: () => void;
}

export function SceneClip({
  sceneIndex,
  narration,
  duration,
  thumbnailUrl,
  isSelected,
  pixelsPerSecond,
  onClick,
}: SceneClipProps) {
  const width = duration * pixelsPerSecond;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex h-16 flex-shrink-0 cursor-pointer flex-col justify-between overflow-hidden rounded border p-1.5 text-left transition-colors",
        isSelected
          ? "border-primary bg-primary/10 ring-2 ring-primary"
          : "border-border bg-muted/50 hover:bg-muted"
      )}
      style={{ width: `${width}px`, minWidth: "60px" }}
    >
      {/* Thumbnail background */}
      {thumbnailUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${thumbnailUrl})` }}
        />
      )}

      {/* Scene index */}
      <div className="relative z-10 flex items-center justify-between">
        <span className="rounded bg-background/80 px-1 text-[10px] font-bold">
          #{sceneIndex + 1}
        </span>
        <span className="rounded bg-background/80 px-1 text-[10px] text-muted-foreground">
          {duration.toFixed(1)}s
        </span>
      </div>

      {/* Narration text (truncated) */}
      <p className="relative z-10 truncate text-[10px] leading-tight text-foreground">
        {narration}
      </p>
    </button>
  );
}
