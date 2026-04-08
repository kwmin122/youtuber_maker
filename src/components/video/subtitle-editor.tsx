"use client";

import { useCallback, useRef, useEffect } from "react";
import type { SubtitleStyle } from "@/lib/video/types";
import { DEFAULT_SUBTITLE_STYLE } from "@/lib/video/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { SubtitlePreview } from "./subtitle-preview";

interface SubtitleEditorProps {
  sceneId: string;
  narrationText: string;
  style: SubtitleStyle;
  onStyleChange: (style: SubtitleStyle) => void;
}

const FONT_OPTIONS = [
  "Noto Sans KR",
  "Pretendard",
  "Nanum Gothic",
  "Nanum Myeongjo",
  "Black Han Sans",
];

export function SubtitleEditor({
  sceneId: _sceneId,
  narrationText,
  style,
  onStyleChange,
}: SubtitleEditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const debouncedChange = useCallback(
    (newStyle: SubtitleStyle) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onStyleChange(newStyle);
      }, 300);
    },
    [onStyleChange]
  );

  function update(partial: Partial<SubtitleStyle>) {
    const newStyle = { ...style, ...partial };
    debouncedChange(newStyle);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">자막 스타일</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onStyleChange(DEFAULT_SUBTITLE_STYLE)}
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          초기화
        </Button>
      </div>

      {/* Live Preview */}
      <SubtitlePreview narrationText={narrationText} style={style} />

      {/* 폰트 (Font Family) */}
      <div className="space-y-1.5">
        <Label className="text-xs">폰트</Label>
        <Select
          value={style.fontFamily}
          onValueChange={(val) => update({ fontFamily: val })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_OPTIONS.map((font) => (
              <SelectItem key={font} value={font}>
                {font}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 크기 (Font Size) */}
      <div className="space-y-1.5">
        <Label className="text-xs">크기 ({style.fontSize}px)</Label>
        <div className="flex items-center gap-2">
          <Slider
            value={[style.fontSize]}
            onValueChange={([val]) => update({ fontSize: val })}
            min={16}
            max={72}
            step={2}
            className="flex-1"
          />
          <Input
            type="number"
            value={style.fontSize}
            onChange={(e) =>
              update({ fontSize: Number(e.target.value) || 36 })
            }
            className="w-16"
            min={16}
            max={72}
          />
        </div>
      </div>

      {/* 글자 색상 (Font Color) */}
      <div className="space-y-1.5">
        <Label className="text-xs">글자 색상</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={style.fontColor}
            onChange={(e) => update({ fontColor: e.target.value })}
            className="h-8 w-8 cursor-pointer rounded border"
          />
          <Input
            value={style.fontColor}
            onChange={(e) => update({ fontColor: e.target.value })}
            className="flex-1"
            placeholder="#FFFFFF"
          />
        </div>
      </div>

      {/* 배경 색상 (Background Color) */}
      <div className="space-y-1.5">
        <Label className="text-xs">배경 색상</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={style.backgroundColor.slice(0, 7)}
            onChange={(e) => {
              const alpha = style.backgroundColor.slice(7) || "80";
              update({ backgroundColor: e.target.value + alpha });
            }}
            className="h-8 w-8 cursor-pointer rounded border"
          />
          <Input
            value={style.backgroundColor}
            onChange={(e) => update({ backgroundColor: e.target.value })}
            className="flex-1"
            placeholder="#00000080"
          />
        </div>
      </div>

      {/* 테두리 색상 (Border Color) */}
      <div className="space-y-1.5">
        <Label className="text-xs">테두리 색상</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={style.borderColor}
            onChange={(e) => update({ borderColor: e.target.value })}
            className="h-8 w-8 cursor-pointer rounded border"
          />
          <Slider
            value={[style.borderWidth]}
            onValueChange={([val]) => update({ borderWidth: val })}
            min={0}
            max={4}
            step={1}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-8">
            {style.borderWidth}px
          </span>
        </div>
      </div>

      {/* 그림자 (Shadow) */}
      <div className="space-y-1.5">
        <Label className="text-xs">그림자</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={style.shadowColor.slice(0, 7)}
            onChange={(e) => {
              const alpha = style.shadowColor.slice(7) || "80";
              update({ shadowColor: e.target.value + alpha });
            }}
            className="h-8 w-8 cursor-pointer rounded border"
          />
          <Slider
            value={[style.shadowOffset]}
            onValueChange={([val]) => update({ shadowOffset: val })}
            min={0}
            max={4}
            step={1}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-8">
            {style.shadowOffset}px
          </span>
        </div>
      </div>

      {/* 위치 (Position) */}
      <div className="space-y-1.5">
        <Label className="text-xs">위치</Label>
        <ToggleGroup
          type="single"
          value={style.position}
          onValueChange={(val) => {
            if (val) update({ position: val as SubtitleStyle["position"] });
          }}
          className="justify-start"
        >
          <ToggleGroupItem value="top" aria-label="top">
            상단
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="center">
            중앙
          </ToggleGroupItem>
          <ToggleGroupItem value="bottom" aria-label="bottom">
            하단
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}
