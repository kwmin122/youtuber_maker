"use client";

import { useEffect } from "react";
import { useExportJob } from "@/hooks/use-export-job";
import { ExportProgress } from "./export-progress";
import { Button } from "@/components/ui/button";
import { Download, RotateCcw, AlertCircle } from "lucide-react";

interface ExportButtonProps {
  projectId: string;
  disabled?: boolean;
  onExportComplete?: (url: string) => void;
}

export function ExportButton({
  projectId,
  disabled,
  onExportComplete,
}: ExportButtonProps) {
  const { status, progress, exportedUrl, errorMessage, startExport, resetExport } =
    useExportJob(projectId);

  // Notify parent when export is complete
  useEffect(() => {
    if (status === "complete" && exportedUrl) {
      onExportComplete?.(exportedUrl);
    }
  }, [status, exportedUrl, onExportComplete]);

  // Idle state
  if (status === "idle") {
    return (
      <Button
        onClick={startExport}
        disabled={disabled}
        className="w-full"
        size="lg"
      >
        <Download className="mr-2 h-4 w-4" />
        MP4 내보내기
      </Button>
    );
  }

  // In progress
  if (status === "pending" || status === "rendering" || status === "uploading") {
    return (
      <div className="w-full rounded-lg border p-4">
        <ExportProgress status={status} progress={progress} />
      </div>
    );
  }

  // Complete
  if (status === "complete" && exportedUrl) {
    return (
      <div className="flex w-full gap-2">
        <Button asChild className="flex-1" size="lg">
          <a href={exportedUrl} download>
            <Download className="mr-2 h-4 w-4" />
            다운로드
          </a>
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={resetExport}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          다시 내보내기
        </Button>
      </div>
    );
  }

  // Failed
  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <span className="text-sm text-destructive">
          내보내기 실패: {errorMessage ?? "알 수 없는 오류"}
        </span>
      </div>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          resetExport();
          startExport();
        }}
      >
        <RotateCcw className="mr-2 h-4 w-4" />
        다시 시도
      </Button>
    </div>
  );
}
