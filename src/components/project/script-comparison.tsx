"use client";

import { Button } from "@/components/ui/button";

interface Script {
  id: string;
  title: string;
  content: string;
  variant: string;
  hookType: string;
  structureType: string;
  wordCount: number;
  estimatedDuration: number;
  isSelected: boolean;
  aiProvider: string;
}

interface ScriptComparisonProps {
  scripts: Script[];
  onSelectVariant: (scriptId: string) => void;
  isSelecting: boolean;
}

export function ScriptComparison({
  scripts,
  onSelectVariant,
  isSelecting,
}: ScriptComparisonProps) {
  if (scripts.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          대본 비교 &mdash; {scripts[0].title}
        </h3>
        <span className="text-xs text-muted-foreground">
          {scripts.length}개 변형
        </span>
      </div>

      <div
        className={`grid gap-4 ${
          scripts.length === 2
            ? "md:grid-cols-2"
            : scripts.length >= 3
              ? "md:grid-cols-3"
              : ""
        }`}
      >
        {scripts.map((script) => (
          <div
            key={script.id}
            className={`rounded-lg border p-4 ${
              script.isSelected
                ? "border-primary ring-2 ring-primary/20"
                : ""
            }`}
          >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                  {script.variant}
                </span>
                {script.isSelected && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
                    선택됨
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {script.aiProvider}
              </span>
            </div>

            {/* Meta */}
            <div className="mb-3 flex gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5">
                후킹: {script.hookType}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5">
                구조: {script.structureType}
              </span>
            </div>

            {/* Script content */}
            <div className="mb-3 max-h-[400px] overflow-y-auto rounded bg-muted/30 p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {script.content}
              </p>
            </div>

            {/* Footer stats */}
            <div className="mb-3 flex justify-between text-xs text-muted-foreground">
              <span>{script.wordCount}단어</span>
              <span>~{script.estimatedDuration}초</span>
            </div>

            {/* Select button */}
            <Button
              onClick={() => onSelectVariant(script.id)}
              disabled={script.isSelected || isSelecting}
              variant={script.isSelected ? "default" : "outline"}
              size="sm"
              className="w-full"
            >
              {script.isSelected ? "선택됨" : "이 변형 선택"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
