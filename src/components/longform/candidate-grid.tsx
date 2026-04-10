"use client";

import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type Candidate = {
  id: string;
  startMs: number;
  endMs: number;
  hookScore: number;
  emotionalScore: number;
  informationDensity: number;
  trendScore: number;
  reason: string;
  titleSuggestion: string | null;
  transcriptSnippet: string | null;
  selected: boolean;
  childProjectId: string | null;
};

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function scoreColorClass(value: number): string {
  if (value >= 80) return "bg-green-500";
  if (value >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-1" data-testid={`score-bar-${label.toLowerCase()}`}>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{clamped}</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full transition-all ${scoreColorClass(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function CandidateGrid(props: {
  candidates: Candidate[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {props.candidates.map((c) => {
        const locked = c.selected;
        const checked = locked || props.selectedIds.has(c.id);
        return (
          <Card key={c.id} className="relative">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    {fmt(c.startMs)} → {fmt(c.endMs)}
                  </div>
                  <CardTitle className="text-base leading-tight">
                    {c.titleSuggestion ?? "(제목 없음)"}
                  </CardTitle>
                </div>
                <Checkbox
                  aria-label={`후보 선택: ${c.titleSuggestion ?? c.id}`}
                  checked={checked}
                  disabled={locked}
                  onCheckedChange={() => props.onToggle(c.id)}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ScoreBar label="Hook" value={c.hookScore} />
              <ScoreBar label="Emotion" value={c.emotionalScore} />
              <ScoreBar label="Density" value={c.informationDensity} />
              <ScoreBar label="Trend" value={c.trendScore} />
              <p
                className="line-clamp-3 text-sm text-muted-foreground"
                title={c.reason}
              >
                {c.reason}
              </p>
              {c.childProjectId && (
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link href={`/projects/${c.childProjectId}`}>
                    프로젝트 열기
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
