"use client";

import { useState, useCallback, useEffect, useRef } from "react";

type ExportStatus =
  | "idle"
  | "pending"
  | "rendering"
  | "uploading"
  | "complete"
  | "failed";

export function useExportJob(projectId: string) {
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Clean up polling on unmount */
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  /** Poll export status */
  const pollStatus = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/export`);
        if (!res.ok) {
          setStatus("failed");
          setErrorMessage("Failed to check export status");
          if (intervalRef.current) clearInterval(intervalRef.current);
          return;
        }

        const data = await res.json();
        const phase = data.phase ?? data.status;
        const percent = data.percent ?? data.progress ?? 0;

        setProgress(percent);

        if (phase === "complete" || phase === "completed") {
          setStatus("complete");
          setProgress(100);
          setExportedUrl(data.url ?? data.exportedUrl ?? null);
          if (intervalRef.current) clearInterval(intervalRef.current);
        } else if (phase === "failed" || phase === "error") {
          setStatus("failed");
          setErrorMessage(data.message ?? "Export failed");
          if (intervalRef.current) clearInterval(intervalRef.current);
        } else if (phase === "uploading") {
          setStatus("uploading");
        } else if (phase === "rendering" || phase === "downloading") {
          setStatus("rendering");
        } else {
          setStatus("pending");
        }
      } catch {
        setStatus("failed");
        setErrorMessage("Network error while polling export");
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 2000);
  }, [projectId]);

  /** Start an export job */
  const startExport = useCallback(async () => {
    setStatus("pending");
    setProgress(0);
    setExportedUrl(null);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to start export");
      }

      setStatus("rendering");
      pollStatus();
    } catch (err) {
      setStatus("failed");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to start export"
      );
    }
  }, [projectId, pollStatus]);

  /** Reset to idle state */
  const resetExport = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStatus("idle");
    setProgress(0);
    setExportedUrl(null);
    setErrorMessage(null);
  }, []);

  return {
    status,
    progress,
    exportedUrl,
    errorMessage,
    startExport,
    resetExport,
  };
}
