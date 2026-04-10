"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CandidateGrid, type Candidate } from "./candidate-grid";
import { LongformProgress } from "./longform-progress";
import { ChildProjectsList } from "./child-projects-list";
import {
  useLongformPolling,
  type LongformPollingState,
} from "@/hooks/use-longform-polling";

type Props = {
  sourceId: string;
  initialState: LongformPollingState;
};

function statusBadgeVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "analyzed" || status === "ready") return "default";
  if (status === "failed") return "destructive";
  return "secondary";
}

export function LongformDetailClient({ sourceId, initialState }: Props) {
  const router = useRouter();
  const { state, isPolling } = useLongformPolling(sourceId, initialState);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clipping, setClipping] = useState(false);
  const analyzeKickedRef = useRef(false);

  const { source, candidates, latestJob } = state;

  // Auto-kick analyze when download is ready and no candidates exist yet.
  useEffect(() => {
    if (analyzeKickedRef.current) return;
    if (source.status !== "ready") return;
    if (candidates.length > 0) return;

    analyzeKickedRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            type: "longform-analyze",
            payload: { sourceId },
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "분석 요청 실패");
        }
        toast.success("분석을 시작합니다.");
      } catch (err) {
        analyzeKickedRef.current = false;
        toast.error((err as Error).message);
      }
    })();
  }, [source.status, candidates.length, sourceId]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function clipSelected(mode: "selected" | "all") {
    setClipping(true);
    try {
      const body =
        mode === "all"
          ? { mode: "all" as const, sourceId }
          : {
              mode: "selected" as const,
              sourceId,
              candidateIds: Array.from(selected),
            };
      const res = await fetch("/api/longform/candidates/clip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "클립 요청 실패");
      toast.success(`${data.count}개 클립 작업을 큐에 등록했습니다.`);
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setClipping(false);
    }
  }

  const showProgress =
    ["pending", "downloading", "analyzing", "clipping"].includes(
      source.status
    ) || (source.status === "ready" && candidates.length === 0);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">
          {source.title ?? "롱폼 소스"}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <Badge variant={statusBadgeVariant(source.status)}>
            {source.status}
          </Badge>
          {source.durationSeconds && (
            <span>{Math.round(source.durationSeconds / 60)}분</span>
          )}
          {source.sourceUrl && (
            <a
              href={source.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="truncate underline hover:text-foreground"
            >
              {source.sourceUrl}
            </a>
          )}
          {isPolling && <span className="text-xs">업데이트 중...</span>}
        </div>
        {source.errorMessage && (
          <p className="text-sm text-red-500">{source.errorMessage}</p>
        )}
      </header>

      {showProgress && (
        <LongformProgress status={source.status} latestJob={latestJob} />
      )}

      {candidates.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">{candidates.length}개 후보</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => clipSelected("selected")}
                disabled={selected.size === 0 || clipping}
              >
                선택한 {selected.size}개 클립
              </Button>
              <Button
                onClick={() => clipSelected("all")}
                disabled={clipping}
              >
                전체 자동 클립
              </Button>
            </div>
          </div>
          <CandidateGrid
            candidates={candidates as Candidate[]}
            selectedIds={selected}
            onToggle={toggleSelect}
          />
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-medium">생성된 자식 프로젝트</h2>
        <ChildProjectsList sourceId={sourceId} />
      </section>
    </div>
  );
}
