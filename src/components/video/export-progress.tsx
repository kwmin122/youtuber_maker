"use client";

import { Progress } from "@/components/ui/progress";

interface ExportProgressProps {
  status: string;
  progress: number;
  currentStep?: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "대기 중...",
  rendering: "영상 렌더링 중",
  uploading: "업로드 중...",
  complete: "완료!",
  failed: "실패",
};

export function ExportProgress({
  status,
  progress,
  currentStep,
}: ExportProgressProps) {
  const label = STATUS_LABELS[status] ?? status;
  const displayLabel =
    status === "rendering" ? `${label}... (${Math.round(progress)}%)` : label;

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{displayLabel}</span>
        <span className="text-xs text-muted-foreground">
          {Math.round(progress)}%
        </span>
      </div>
      <Progress value={progress} className="h-2" />
      {currentStep && (
        <p className="text-xs text-muted-foreground">{currentStep}</p>
      )}
    </div>
  );
}
