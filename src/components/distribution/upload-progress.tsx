"use client";

import { useJobStatus } from "@/hooks/use-job-status";
import { ExternalLink, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface UploadProgressProps {
  jobId: string | null;
  supabaseJwt: string | null;
  onRetry?: () => void;
  videoUrl?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Waiting...",
  active: "Uploading...",
  completed: "Upload Complete",
  failed: "Upload Failed",
};

export function UploadProgress({
  jobId,
  supabaseJwt,
  onRetry,
  videoUrl,
}: UploadProgressProps) {
  const job = useJobStatus(jobId, supabaseJwt);

  if (!jobId) return null;

  const status = job?.status ?? "pending";
  const progress = job?.progress ?? 0;
  const currentStep = job?.currentStep ?? "Preparing...";
  const errorMessage = job?.errorMessage ?? null;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {STATUS_LABELS[status] ?? status}
        </p>
        <StatusIcon status={status} />
      </div>

      <Progress value={progress} className="h-2" />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{currentStep}</p>
        <p className="text-xs font-medium tabular-nums">{progress}%</p>
      </div>

      {status === "completed" && videoUrl && (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          View on YouTube
        </a>
      )}

      {status === "failed" && (
        <div className="space-y-2">
          {errorMessage && (
            <p className="text-xs text-destructive">{errorMessage}</p>
          )}
          {onRetry && (
            <Button onClick={onRetry} size="sm" variant="outline">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry Upload
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "failed":
      return <XCircle className="h-5 w-5 text-red-500" />;
    case "active":
      return (
        <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
      );
    default:
      return (
        <div className="h-4 w-4 animate-pulse rounded-full bg-muted-foreground/30" />
      );
  }
}
