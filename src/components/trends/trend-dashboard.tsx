"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface TrendRow {
  keyword: string;
  rank: number;
  source: string;
  recordedAt: string;
}

interface TrendsApiResponse {
  latestDate: string | null;
  lastRun: { endedAt: string | null; status: string; partial: boolean } | null;
  categories: Record<number, TrendRow[]>;
  categoryLabels: Record<number, string>;
}

const STALE_THRESHOLD_MS = 8 * 60 * 60 * 1000; // 8h (R-08)
const REFRESH_COOLDOWN_MS = 60 * 1000; // 1min rate limit

export function TrendDashboard() {
  const [data, setData] = useState<TrendsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<number>(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/trends");
      if (!res.ok) throw new Error("트렌드 데이터 로드 실패");
      const json: TrendsApiResponse = await res.json();
      setData(json);
      const categoryIds = Object.keys(json.categories).map(Number);
      if (categoryIds.length > 0 && selectedCategoryId === null) {
        setSelectedCategoryId(categoryIds[0]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "로드 오류");
    } finally {
      setLoading(false);
    }
  }, [selectedCategoryId]);

  useEffect(() => {
    fetchData();
  }, []);

  async function handleManualRefresh() {
    if (Date.now() - lastRefreshAt < REFRESH_COOLDOWN_MS) {
      toast.error("1분 후에 다시 시도하세요");
      return;
    }
    setRefreshing(true);
    try {
      const res = await fetch("/api/trends/refresh", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "새로고침 실패");
      }
      toast.success("트렌드 수집 작업이 시작되었습니다");
      setLastRefreshAt(Date.now());
      setTimeout(fetchData, 3000); // re-fetch after 3s
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "새로고침 오류");
    } finally {
      setRefreshing(false);
    }
  }

  const isStale =
    data?.lastRun?.endedAt != null &&
    Date.now() - new Date(data.lastRun.endedAt).getTime() > STALE_THRESHOLD_MS;

  const lastUpdatedLabel = data?.lastRun?.endedAt
    ? (() => {
        const diffMs = Date.now() - new Date(data.lastRun!.endedAt!).getTime();
        const diffH = Math.floor(diffMs / (60 * 60 * 1000));
        const diffM = Math.floor((diffMs % (60 * 60 * 1000)) / 60000);
        if (diffH > 0) return `${diffH}시간 ${diffM}분 전`;
        return `${diffM}분 전`;
      })()
    : null;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || !data.latestDate) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        <p>아직 트렌드 데이터가 없습니다.</p>
        <p className="text-sm mt-1">
          Vercel Cron이 설정되어 있으면 6시간 후 자동 수집됩니다.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={handleManualRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-3 w-3 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-3 w-3 mr-2" />
          )}
          지금 수집
        </Button>
      </div>
    );
  }

  const categoryIds = Object.keys(data.categories)
    .map(Number)
    .sort((a, b) => a - b);
  const currentKeywords =
    selectedCategoryId !== null
      ? (data.categories[selectedCategoryId] ?? [])
      : [];

  return (
    <div className="space-y-4">
      {/* Stale banner */}
      {isStale && (
        <div
          role="alert"
          aria-label="stale-banner"
          className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>데이터가 오래되었습니다 — 수동으로 새로고침하세요</span>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {lastUpdatedLabel
              ? `마지막 업데이트: ${lastUpdatedLabel}`
              : "업데이트 기록 없음"}
            {data.lastRun?.partial && (
              <span className="ml-2 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700">
                일부 수집
              </span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleManualRefresh}
          disabled={refreshing || Date.now() - lastRefreshAt < REFRESH_COOLDOWN_MS}
        >
          {refreshing ? (
            <Loader2 className="h-3 w-3 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-3 w-3 mr-2" />
          )}
          새로고침
        </Button>
      </div>

      {/* Category tabs */}
      <div
        role="tablist"
        className="flex gap-1 flex-wrap border-b pb-2"
      >
        {categoryIds.map((catId) => (
          <button
            key={catId}
            role="tab"
            aria-selected={selectedCategoryId === catId}
            onClick={() => setSelectedCategoryId(catId)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedCategoryId === catId
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {data.categoryLabels[catId] ?? `카테고리 ${catId}`}
          </button>
        ))}
      </div>

      {/* Keyword list */}
      <div className="space-y-1">
        {currentKeywords.slice(0, 20).map((row) => (
          <div
            key={`${row.rank}-${row.keyword}`}
            className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50"
          >
            <span className="w-6 text-right text-xs font-mono text-muted-foreground">
              {row.rank}
            </span>
            <span className="flex-1 text-sm font-medium">{row.keyword}</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                row.source === "youtube"
                  ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
              }`}
            >
              {row.source === "youtube" ? "YT" : "GT"}
            </span>
          </div>
        ))}
        {currentKeywords.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            이 카테고리의 트렌드 데이터가 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
