"use client";

import { useEffect, useState } from "react";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";

interface GapKeyword {
  keyword: string;
  categoryId: number;
  rank: number;
  source: string;
}

interface GapResponse {
  keywords: GapKeyword[];
  hitCache: boolean;
}

interface RationaleResponse {
  keyword: string;
  rationale: string;
  suggestedAngle: string;
  hitCache: boolean;
}

interface GapPanelProps {
  projectId: string;
}

export function GapPanel({ projectId }: GapPanelProps) {
  const [loading, setLoading] = useState(true);
  const [keywords, setKeywords] = useState<GapKeyword[]>([]);
  const [hitCache, setHitCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rationales, setRationales] = useState<Record<string, RationaleResponse>>({});
  const [loadingRationale, setLoadingRationale] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const res = await fetch(`/api/trends/gap?projectId=${projectId}`);
        if (!res.ok) throw new Error("갭 분석 로드 실패");
        const json: GapResponse = await res.json();
        setKeywords(json.keywords);
        setHitCache(json.hitCache);
      } catch (err) {
        setError(err instanceof Error ? err.message : "오류");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  async function handleExpand(keyword: string) {
    if (expanded === keyword) {
      setExpanded(null);
      return;
    }
    setExpanded(keyword);
    if (rationales[keyword]) return; // already loaded

    setLoadingRationale(keyword);
    try {
      const res = await fetch("/api/trends/gap/rationale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword, projectId }),
      });
      if (!res.ok) throw new Error("rationale 로드 실패");
      const json: RationaleResponse = await res.json();
      setRationales((prev) => ({ ...prev, [keyword]: json }));
    } catch {
      setRationales((prev) => ({
        ...prev,
        [keyword]: {
          keyword,
          rationale: "분석을 불러오지 못했습니다.",
          suggestedAngle: "",
          hitCache: false,
        },
      }));
    } finally {
      setLoadingRationale(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        미개척 키워드 분석 중...
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive py-2">{error}</p>
    );
  }

  if (keywords.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        아직 미개척 키워드가 없습니다. 트렌드 데이터가 수집되면 자동으로 분석됩니다.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">미개척 키워드</h3>
        {hitCache && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            캐시됨
          </span>
        )}
      </div>
      <div className="space-y-1">
        {keywords.map((kw) => (
          <div key={kw.keyword} className="rounded-md border">
            <button
              type="button"
              onClick={() => handleExpand(kw.keyword)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{kw.keyword}</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  #{kw.rank}
                </span>
              </div>
              {expanded === kw.keyword ? (
                <ChevronUp className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
            {expanded === kw.keyword && (
              <div className="border-t px-3 py-2">
                {loadingRationale === kw.keyword ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    분석 중...
                  </div>
                ) : rationales[kw.keyword] ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {rationales[kw.keyword].rationale}
                    </p>
                    {rationales[kw.keyword].suggestedAngle && (
                      <p className="text-xs">
                        <span className="font-medium">추천 각도: </span>
                        {rationales[kw.keyword].suggestedAngle}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
