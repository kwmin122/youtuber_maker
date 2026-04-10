"use client";

import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ViralScoreResult } from "@/lib/distribution/types";

interface ViralScoreDisplayProps {
  result: ViralScoreResult | null;
  isLoading?: boolean;
  onGenerate?: () => void;
}

const VERDICT_COLORS: Record<string, string> = {
  viral: "text-green-500",
  promising: "text-blue-500",
  average: "text-yellow-500",
  weak: "text-red-500",
};

const VERDICT_GAUGE_COLORS: Record<string, string> = {
  viral: "#22c55e",
  promising: "#3b82f6",
  average: "#eab308",
  weak: "#ef4444",
};

interface BreakdownBarProps {
  label: string;
  value: number;
  max: number;
}

function BreakdownBar({ label, value, max }: BreakdownBarProps) {
  const pct = Math.round((value / max) * 100);
  // Color gradient from red (low) to green (high)
  const hue = Math.round((pct / 100) * 120); // 0=red, 120=green

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {value}/{max}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: `hsl(${hue}, 70%, 50%)`,
          }}
        />
      </div>
    </div>
  );
}

function CircularGauge({
  score,
  verdict,
}: {
  score: number;
  verdict: string;
}) {
  const color = VERDICT_GAUGE_COLORS[verdict] ?? "#6b7280";
  const angle = (score / 100) * 360;

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative flex h-32 w-32 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(${color} ${angle}deg, var(--color-muted) ${angle}deg)`,
        }}
      >
        <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-background">
          <span className="text-3xl font-bold tabular-nums">{score}</span>
        </div>
      </div>
      <span
        className={`mt-2 text-sm font-semibold capitalize ${VERDICT_COLORS[verdict] ?? ""}`}
      >
        {verdict}
      </span>
    </div>
  );
}

export function ViralScoreDisplay({
  result,
  isLoading,
  onGenerate,
}: ViralScoreDisplayProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border p-8">
        <div className="h-32 w-32 animate-pulse rounded-full bg-muted" />
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="w-full max-w-xs space-y-3">
          <div className="h-2 animate-pulse rounded bg-muted" />
          <div className="h-2 animate-pulse rounded bg-muted" />
          <div className="h-2 animate-pulse rounded bg-muted" />
          <div className="h-2 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-12 text-center">
        <Zap className="h-10 w-10 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Analyze Viral Potential</p>
          <p className="mt-1 text-xs text-muted-foreground">
            AI will score your content across 4 dimensions.
          </p>
        </div>
        {onGenerate && (
          <Button onClick={onGenerate} size="sm" variant="outline">
            Analyze Viral Potential
          </Button>
        )}
      </div>
    );
  }

  const { score, breakdown, suggestions, verdict } = result;

  return (
    <div className="space-y-6 rounded-lg border p-6">
      {/* Circular gauge */}
      <CircularGauge score={score} verdict={verdict} />

      {/* Breakdown bars */}
      <div className="space-y-3">
        <BreakdownBar
          label="Hook Strength"
          value={breakdown.hookStrength}
          max={25}
        />
        <BreakdownBar
          label="Emotional Trigger"
          value={breakdown.emotionalTrigger}
          max={25}
        />
        <BreakdownBar
          label="Trend Fit"
          value={breakdown.trendFit}
          max={25}
        />
        <BreakdownBar
          label="Title Clickability"
          value={breakdown.titleClickability}
          max={25}
        />
      </div>

      {/* Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Suggestions</p>
          <ul className="space-y-1.5">
            {suggestions.map((suggestion, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <span className="mt-0.5 text-primary">-</span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
