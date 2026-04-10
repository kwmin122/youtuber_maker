"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export type UploadStateValue =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "uploading"; progress: number }
  | { phase: "creating" }
  | { phase: "error"; message: string };

export function UploadProgress({
  state,
  onRetry,
}: {
  state: UploadStateValue;
  onRetry?: () => void;
}) {
  if (state.phase === "idle") return null;

  if (state.phase === "error") {
    return (
      <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <p className="font-medium">업로드 실패</p>
        <p className="text-xs">{state.message}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            다시 시도
          </Button>
        )}
      </div>
    );
  }

  const label =
    state.phase === "signing"
      ? "업로드 URL 발급 중..."
      : state.phase === "uploading"
        ? `업로드 중... ${state.progress}%`
        : "소스 등록 중...";

  const progress =
    state.phase === "uploading"
      ? state.progress
      : state.phase === "signing"
        ? 5
        : 95;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span>{progress}%</span>
      </div>
      <Progress value={progress} />
    </div>
  );
}
