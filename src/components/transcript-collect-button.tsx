"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, FileText } from "lucide-react";
import { useJobStatus } from "@/hooks/use-job-status";

type Props = {
  channelId: string;
  topN?: number;
  supabaseJwt: string | null;
  onCompleted?: () => void;
};

export function TranscriptCollectButton({
  channelId,
  topN = 10,
  supabaseJwt,
  onCompleted,
}: Props) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const jobStatus = useJobStatus(jobId, supabaseJwt);

  const isRunning =
    jobStatus?.status === "active" ||
    jobStatus?.status === "pending";
  const isCompleted = jobStatus?.status === "completed";
  const isFailed = jobStatus?.status === "failed";

  async function handleCollect() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "transcript-collect",
          payload: { channelId, topN },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "자막 수집 작업 생성 실패");
      }

      const data = await res.json();
      setJobId(data.jobId);
      toast.success("자막 수집을 시작합니다");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "자막 수집 실패"
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Notify parent on completion
  if (isCompleted && onCompleted) {
    onCompleted();
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleCollect}
        disabled={submitting || isRunning}
        variant="secondary"
      >
        {submitting || isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        <span className="ml-1.5">
          {isRunning
            ? "수집 중..."
            : `상위 ${topN}개 영상 자막 수집`}
        </span>
      </Button>

      {isRunning && jobStatus && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground truncate max-w-[300px]">
              {jobStatus.currentStep}
            </span>
            <span className="font-medium tabular-nums">
              {jobStatus.progress}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${jobStatus.progress}%` }}
            />
          </div>
        </div>
      )}

      {isCompleted && (
        <p className="text-sm text-green-600">
          자막 수집이 완료되었습니다.
        </p>
      )}

      {isFailed && (
        <p className="text-sm text-destructive">
          자막 수집 실패: {jobStatus?.errorMessage}
        </p>
      )}
    </div>
  );
}
