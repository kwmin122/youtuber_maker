"use client";

import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export type AvatarPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "center"
  | "fullscreen";

export type AvatarLayoutValue = {
  enabled: boolean;
  position: AvatarPosition;
  scale: number;
  paddingPx: number;
};

const POSITIONS: { value: AvatarPosition; label: string }[] = [
  { value: "bottom-right", label: "우하단" },
  { value: "bottom-left", label: "좌하단" },
  { value: "top-right", label: "우상단" },
  { value: "center", label: "중앙" },
  { value: "fullscreen", label: "전체화면" },
];

interface Props {
  value: AvatarLayoutValue;
  onChange: (v: AvatarLayoutValue) => void;
}

export function AvatarLayoutPicker({ value, onChange }: Props) {
  function setPosition(position: AvatarPosition) {
    onChange({ ...value, position });
  }

  function setScale(s: number[]) {
    onChange({ ...value, scale: s[0] });
  }

  return (
    <div className="space-y-3" data-testid="avatar-layout-picker">
      <div className="flex flex-wrap gap-1">
        {POSITIONS.map((p) => (
          <button
            key={p.value}
            type="button"
            data-testid={`layout-position-${p.value}`}
            onClick={() => setPosition(p.value)}
            className={cn(
              "rounded px-2 py-1 text-xs",
              value.position === p.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/70"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground w-12">
          크기 {Math.round(value.scale * 100)}%
        </span>
        <Slider
          data-testid="avatar-scale-slider"
          min={10}
          max={100}
          step={5}
          value={[Math.round(value.scale * 100)]}
          onValueChange={(s) => setScale([s[0] / 100])}
          className="flex-1"
        />
      </div>
    </div>
  );
}
