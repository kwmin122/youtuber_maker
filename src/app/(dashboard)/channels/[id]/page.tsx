"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { VideoTable } from "@/components/video-table";
import { TranscriptCollectButton } from "@/components/transcript-collect-button";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Channel = {
  id: string;
  title: string;
  subscriberCount?: number | null;
  thumbnailUrl?: string | null;
};

type Video = {
  id: string;
  youtubeVideoId: string;
  title: string;
  thumbnailUrl?: string | null;
  publishedAt?: string | null;
  duration?: string | null;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  performanceScore?: number | null;
  engagementRate?: number | null;
};

export default function ChannelDetailPage() {
  const params = useParams();
  const channelId = params.id as string;

  const [channel, setChannel] = useState<Channel | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState("viewCount");
  const [supabaseJwt, setSupabaseJwt] = useState<string | null>(null);

  // Fetch Supabase JWT for realtime
  useEffect(() => {
    fetch("/api/supabase-token")
      .then((r) => r.json())
      .then((d) => setSupabaseJwt(d.token))
      .catch(() => {});
  }, []);

  const fetchVideos = useCallback(
    async (sort: string, refresh = false) => {
      const refreshParam = refresh ? "&refresh=true" : "";
      try {
        const res = await fetch(
          `/api/channels/${channelId}/videos?sort=${sort}${refreshParam}`
        );
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "영상 데이터 로딩 실패");
        }
        const data = await res.json();
        setChannel(data.channel);
        setVideos(data.videos);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "영상 데이터 로딩 실패"
        );
      }
    },
    [channelId]
  );

  useEffect(() => {
    setLoading(true);
    fetchVideos(sortBy).finally(() => setLoading(false));
  }, [fetchVideos, sortBy]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchVideos(sortBy, true);
    setRefreshing(false);
    toast.success("영상 데이터를 갱신했습니다");
  }

  function handleSortChange(sort: string) {
    setSortBy(sort);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl py-8 px-4 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/channels">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3 flex-1">
          {channel?.thumbnailUrl && (
            <img
              src={channel.thumbnailUrl}
              alt={channel.title}
              className="h-10 w-10 rounded-full"
            />
          )}
          <div>
            <h1 className="text-xl font-bold">
              {channel?.title || "채널"}
            </h1>
            {channel?.subscriberCount && (
              <p className="text-sm text-muted-foreground">
                구독자{" "}
                {channel.subscriberCount.toLocaleString()}명
              </p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-1.5">새로고침</span>
        </Button>
      </div>

      <div className="rounded-lg border p-4">
        <TranscriptCollectButton
          channelId={channelId}
          topN={10}
          supabaseJwt={supabaseJwt}
          onCompleted={() => fetchVideos(sortBy)}
        />
      </div>

      <VideoTable
        channelId={channelId}
        videos={videos}
        subscriberCount={channel?.subscriberCount}
        onSortChange={handleSortChange}
      />
    </div>
  );
}
