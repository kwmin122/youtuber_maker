"use client";

import type { TransitionType } from "@/lib/video/types";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Blend,
  ArrowLeftRight,
  MoveLeft,
  MoveRight,
  ZoomIn,
  Scissors,
} from "lucide-react";

interface TransitionPickerProps {
  sceneId: string;
  currentType: TransitionType;
  currentDuration: number;
  onTransitionChange: (type: TransitionType, duration: number) => void;
}

const TRANSITIONS: Array<{
  type: TransitionType;
  label: string;
  icon: typeof Blend;
}> = [
  { type: "fade", label: "페이드", icon: Blend },
  { type: "dissolve", label: "디졸브", icon: ArrowLeftRight },
  { type: "slide-left", label: "왼쪽 슬라이드", icon: MoveLeft },
  { type: "slide-right", label: "오른쪽 슬라이드", icon: MoveRight },
  { type: "zoom-in", label: "줌 인", icon: ZoomIn },
  { type: "cut", label: "컷", icon: Scissors },
];

export function TransitionPicker({
  sceneId: _sceneId,
  currentType,
  currentDuration,
  onTransitionChange,
}: TransitionPickerProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">전환 효과</h3>

      {/* Transition type grid (2 columns, 3 rows) */}
      <div className="grid grid-cols-2 gap-2">
        {TRANSITIONS.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => onTransitionChange(type, currentDuration)}
            className={cn(
              "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors",
              currentType === type
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-foreground hover:bg-muted"
            )}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Duration slider (only visible when type is not 'cut') */}
      {currentType !== "cut" && (
        <div className="space-y-1.5">
          <Label className="text-xs">
            전환 시간: {currentDuration.toFixed(1)}초
          </Label>
          <Slider
            value={[currentDuration]}
            onValueChange={([val]) =>
              onTransitionChange(currentType, val)
            }
            min={0.2}
            max={1.0}
            step={0.1}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0.2초</span>
            <span>1.0초</span>
          </div>
        </div>
      )}
    </div>
  );
}
