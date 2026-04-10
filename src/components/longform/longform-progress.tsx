"use client";

import { Progress } from "@/components/ui/progress";
import type {
  LongformLatestJob,
  LongformSourceStatus,
} from "@/hooks/use-longform-polling";

const STATUS_LABEL: Record<LongformSourceStatus, string> = {
  pending: "대기 중",
  downloading: "다운로드 중",
  analyzing: "분석 중",
  ready: "다운로드 완료",
  analyzed: "분석 완료",
  clipping: "클립 생성 중",
  failed: "실패",
};

export function LongformProgress({
  status,
  latestJob,
}: {
  status: LongformSourceStatus;
  latestJob: LongformLatestJob | null;
}) {
  const progress = latestJob?.progress ?? 0;
  const step = latestJob?.currentStep ?? STATUS_LABEL[status];
  return (
    <div className="space-y-2 rounded-md border p-4">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{step}</span>
        <span className="text-muted-foreground">{progress}%</span>
      </div>
      <Progress value={progress} />
      {latestJob?.errorMessage && (
        <p className="text-sm text-red-500">{latestJob.errorMessage}</p>
      )}
    </div>
  );
}
