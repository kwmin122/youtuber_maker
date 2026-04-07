"use client";

import { useJobStatus, type JobStatus } from "@/hooks/use-job-status";

function statusColor(status: JobStatus["status"]) {
  switch (status) {
    case "pending":
      return "bg-gray-500";
    case "active":
      return "bg-blue-500";
    case "completed":
      return "bg-green-500";
    case "failed":
      return "bg-red-500";
  }
}

function statusLabel(status: JobStatus["status"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "active":
      return "Active";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
  }
}

interface JobProgressProps {
  jobId: string | null;
  supabaseJwt: string | null;
}

export function JobProgress({ jobId, supabaseJwt }: JobProgressProps) {
  const job = useJobStatus(jobId, supabaseJwt);

  if (!jobId) return null;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Job Progress</h3>
        {job && (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white ${statusColor(job.status)}`}
          >
            {statusLabel(job.status)}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${
            job?.status === "failed"
              ? "bg-red-500"
              : job?.status === "completed"
                ? "bg-green-500"
                : "bg-blue-500"
          }`}
          style={{ width: `${job?.progress ?? 0}%` }}
        />
      </div>

      {/* Current step */}
      {job?.currentStep && (
        <p className="text-xs text-muted-foreground">
          Step: {job.currentStep}
        </p>
      )}

      {/* Progress percentage */}
      <p className="text-xs text-muted-foreground">
        {job?.progress ?? 0}% complete
      </p>

      {/* Error message */}
      {job?.status === "failed" && job.errorMessage && (
        <p className="text-xs text-red-500">{job.errorMessage}</p>
      )}

      {/* Success message */}
      {job?.status === "completed" && (
        <p className="text-xs text-green-600">Job completed successfully!</p>
      )}
    </div>
  );
}
