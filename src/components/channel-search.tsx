"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Search, Plus } from "lucide-react";

type SearchResult = {
  channelId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  subscriberCount?: number;
};

type Props = {
  onImported?: () => void;
};

export function ChannelSearch({ onImported }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/channels/search?q=${encodeURIComponent(query.trim())}&limit=10`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "검색 실패");
      }
      const data = await res.json();
      setResults(data.results);
      if (data.results.length === 0) {
        toast.info("검색 결과가 없습니다");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "검색 실패"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(channelId: string) {
    setImporting(channelId);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `https://youtube.com/channel/${channelId}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "채널 추가 실패");
      }
      const channel = await res.json();
      toast.success(`"${channel.title}" 채널을 추가했습니다`);
      onImported?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "채널 추가 실패"
      );
    } finally {
      setImporting(null);
    }
  }

  function formatSubscribers(count?: number): string {
    if (!count) return "-";
    if (count >= 1_000_000)
      return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="channel-search">키워드 검색</Label>
        <p className="text-xs text-muted-foreground">
          검색은 YouTube API 쿼터 100 units을 소비합니다. URL 직접
          입력을 권장합니다.
        </p>
      </div>
      <div className="flex gap-3">
        <Input
          id="channel-search"
          placeholder="채널 키워드 검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          disabled={loading}
        />
        <Button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          variant="secondary"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          <span className="ml-1.5">검색</span>
        </Button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r) => (
            <div
              key={r.channelId}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              {r.thumbnailUrl && (
                <img
                  src={r.thumbnailUrl}
                  alt={r.title}
                  className="h-10 w-10 rounded-full"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.title}</p>
                <p className="text-xs text-muted-foreground">
                  구독자 {formatSubscribers(r.subscriberCount)}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleImport(r.channelId)}
                disabled={importing === r.channelId}
              >
                {importing === r.channelId ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                <span className="ml-1">추가</span>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
