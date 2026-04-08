"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { JobProgress } from "@/components/job-progress";
import { AnalysisCard } from "./analysis-card";
import { TopicPicker } from "./topic-picker";
import { ScriptComparison } from "./script-comparison";

interface ScriptTabProps {
  projectId: string;
}

type Analysis = {
  id: string;
  channelId: string;
  toneAnalysis: any;
  hookingPatterns: any[];
  structurePatterns: any[];
  topicRecommendations: any[];
  aiProvider: string;
  createdAt: string;
};

type Script = {
  id: string;
  title: string;
  content: string;
  variant: string;
  hookType: string;
  structureType: string;
  wordCount: number;
  estimatedDuration: number;
  isSelected: boolean;
  aiProvider: string;
};

type Channel = {
  id: string;
  channelId: string;
  title: string;
  thumbnailUrl: string | null;
};

export function ScriptTab({ projectId }: ScriptTabProps) {
  // Data state
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [scripts, setScripts] = useState<Script[]>([]);

  // Job state
  const [analyzeJobId, setAnalyzeJobId] = useState<string | null>(null);
  const [scriptJobId, setScriptJobId] = useState<string | null>(null);
  const [supabaseJwt, setSupabaseJwt] = useState<string | null>(null);

  // UI state
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [submittingAnalysis, setSubmittingAnalysis] = useState(false);
  const [submittingScript, setSubmittingScript] = useState(false);
  const [selectingVariant, setSelectingVariant] = useState(false);

  // Fetch Supabase JWT for Realtime
  const fetchSupabaseJwt = useCallback(async () => {
    if (supabaseJwt) return;
    try {
      const res = await fetch("/api/supabase-token");
      if (res.ok) {
        const { token } = await res.json();
        setSupabaseJwt(token);
      }
    } catch {
      // Silent
    }
  }, [supabaseJwt]);

  // Load project channels
  useEffect(() => {
    async function loadChannels() {
      try {
        const res = await fetch(`/api/projects/${projectId}/channels`);
        if (res.ok) {
          const data = await res.json();
          setChannels(data);
          if (data.length > 0) {
            setSelectedChannelId(data[0].channelId);
          }
        }
      } catch {
        // Silent
      } finally {
        setLoadingChannels(false);
      }
    }
    loadChannels();
  }, [projectId]);

  // Load existing analysis when channel is selected
  useEffect(() => {
    if (!selectedChannelId) return;

    async function loadAnalysis() {
      try {
        const res = await fetch(`/api/projects/${projectId}/analyses`);
        if (res.ok) {
          const data: Analysis[] = await res.json();
          const channelAnalysis = data.find(
            (a) => a.channelId === selectedChannelId
          );
          if (channelAnalysis) {
            setAnalysis(channelAnalysis);
          } else {
            setAnalysis(null);
          }
        }
      } catch {
        // Silent
      }
    }
    loadAnalysis();
  }, [projectId, selectedChannelId]);

  // Load existing scripts when analysis is loaded
  useEffect(() => {
    if (!analysis) return;

    async function loadScripts() {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/scripts?analysisId=${analysis!.id}`
        );
        if (res.ok) {
          const data: Script[] = await res.json();
          setScripts(data);
        }
      } catch {
        // Silent
      }
    }
    loadScripts();
  }, [projectId, analysis]);

  // Submit analysis job
  async function handleRunAnalysis() {
    if (!selectedChannelId) return;
    setSubmittingAnalysis(true);
    try {
      await fetchSupabaseJwt();

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "analyze-benchmark",
          projectId,
          payload: { projectId, channelId: selectedChannelId },
        }),
      });

      if (!res.ok) throw new Error("Failed to submit analysis job");

      const { jobId } = await res.json();
      setAnalyzeJobId(jobId);
    } catch {
      // Handle error
    } finally {
      setSubmittingAnalysis(false);
    }
  }

  // Submit script generation job
  async function handleGenerateScripts(topicIndex: number) {
    if (!analysis) return;
    setSubmittingScript(true);
    try {
      await fetchSupabaseJwt();

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "generate-script",
          projectId,
          payload: {
            projectId,
            analysisId: analysis.id,
            topicIndex,
          },
        }),
      });

      if (!res.ok) throw new Error("Failed to submit script job");

      const { jobId } = await res.json();
      setScriptJobId(jobId);
    } catch {
      // Handle error
    } finally {
      setSubmittingScript(false);
    }
  }

  // Select a variant
  async function handleSelectVariant(scriptId: string) {
    setSelectingVariant(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/scripts/${scriptId}`,
        {
          method: "PATCH",
        }
      );

      if (res.ok) {
        // Refresh scripts
        const listRes = await fetch(
          `/api/projects/${projectId}/scripts?analysisId=${analysis!.id}`
        );
        if (listRes.ok) {
          setScripts(await listRes.json());
        }
      }
    } catch {
      // Handle error
    } finally {
      setSelectingVariant(false);
    }
  }

  // Loading state
  if (loadingChannels) {
    return (
      <p className="text-sm text-muted-foreground">채널 정보 로딩 중...</p>
    );
  }

  // No channels linked
  if (channels.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          벤치마킹할 채널을 먼저 추가해주세요.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          채널 탭에서 채널을 검색하고 프로젝트에 추가한 후 자막을 수집하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Channel selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium">벤치마킹 채널</label>
        <select
          value={selectedChannelId || ""}
          onChange={(e) => setSelectedChannelId(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          {channels.map((ch) => (
            <option key={ch.channelId} value={ch.channelId}>
              {ch.title}
            </option>
          ))}
        </select>
      </div>

      {/* Step 1: Run analysis */}
      {!analysis && (
        <div className="space-y-3">
          <Button
            onClick={handleRunAnalysis}
            disabled={submittingAnalysis || !selectedChannelId}
          >
            {submittingAnalysis ? "분석 요청 중..." : "AI 벤치마킹 분석 시작"}
          </Button>
          <JobProgress jobId={analyzeJobId} supabaseJwt={supabaseJwt} />
        </div>
      )}

      {/* Step 2: Show analysis results */}
      {analysis && (
        <AnalysisCard analysis={analysis} />
      )}

      {/* Step 3: Topic picker */}
      {analysis && scripts.length === 0 && (
        <>
          <TopicPicker
            topics={analysis.topicRecommendations}
            onSelect={handleGenerateScripts}
            isGenerating={submittingScript}
          />
          <JobProgress jobId={scriptJobId} supabaseJwt={supabaseJwt} />
        </>
      )}

      {/* Step 4: Script comparison */}
      {scripts.length > 0 && (
        <ScriptComparison
          scripts={scripts}
          onSelectVariant={handleSelectVariant}
          isSelecting={selectingVariant}
        />
      )}
    </div>
  );
}
