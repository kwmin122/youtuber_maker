"use client";

import { useEffect, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase";

export type JobStatus = {
  id: string;
  status: "pending" | "active" | "completed" | "failed";
  progress: number;
  currentStep: string | null;
  errorMessage: string | null;
};

export function useJobStatus(
  jobId: string | null,
  supabaseJwt: string | null
) {
  const [job, setJob] = useState<JobStatus | null>(null);

  useEffect(() => {
    if (!jobId || !supabaseJwt) return;

    const supabase = createSupabaseClient();
    supabase.realtime.setAuth(supabaseJwt);

    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          setJob({
            id: row.id as string,
            status: row.status as JobStatus["status"],
            progress: row.progress as number,
            currentStep: (row.current_step as string) || null,
            errorMessage: (row.error_message as string) || null,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId, supabaseJwt]);

  return job;
}
