"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";

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

type Props = {
  channelId: string;
  videos: Video[];
  subscriberCount?: number | null;
  onSortChange?: (sort: string) => void;
};

function formatCount(count?: number | null): string {
  if (count === null || count === undefined) return "-";
  if (count >= 1_000_000)
    return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
}

function formatDuration(iso?: string | null): string {
  if (!iso) return "-";
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return iso;
  const h = match[1] ? `${match[1]}:` : "";
  const m = (match[2] || "0").padStart(h ? 2 : 1, "0");
  const s = (match[3] || "0").padStart(2, "0");
  return `${h}${m}:${s}`;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function VideoTable({
  channelId,
  videos,
  subscriberCount,
  onSortChange,
}: Props) {
  const [sortBy, setSortBy] = useState("viewCount");

  function handleSort(field: string) {
    setSortBy(field);
    onSortChange?.(field);
  }

  const SortHeader = ({
    field,
    children,
  }: {
    field: string;
    children: React.ReactNode;
  }) => (
    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
      <Button
        variant="ghost"
        size="sm"
        className={`-ml-3 h-auto p-1 text-xs ${sortBy === field ? "text-foreground font-semibold" : ""}`}
        onClick={() => handleSort(field)}
      >
        {children}
        <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    </th>
  );

  if (videos.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>영상 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[300px]">
              영상
            </th>
            <SortHeader field="viewCount">조회수</SortHeader>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              구독자
            </th>
            <SortHeader field="performanceScore">
              성과도
            </SortHeader>
            <SortHeader field="engagementRate">참여율</SortHeader>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              좋아요
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              댓글
            </th>
            <SortHeader field="publishedAt">게시일</SortHeader>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              길이
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {videos.map((video) => (
            <tr
              key={video.id}
              className="hover:bg-accent/50 transition-colors"
            >
              <td className="px-3 py-2">
                <Link
                  href={`/channels/${channelId}/videos/${video.id}`}
                  className="flex items-center gap-3"
                >
                  {video.thumbnailUrl ? (
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="h-12 w-20 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-20 rounded bg-muted shrink-0" />
                  )}
                  <span className="font-medium line-clamp-2 text-sm">
                    {video.title}
                  </span>
                </Link>
              </td>
              <td className="px-3 py-2 tabular-nums">
                {formatCount(video.viewCount)}
              </td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">
                {formatCount(subscriberCount)}
              </td>
              <td className="px-3 py-2 tabular-nums">
                <span
                  className={
                    (video.performanceScore || 0) >= 1
                      ? "text-green-600 font-medium"
                      : ""
                  }
                >
                  {video.performanceScore?.toFixed(2) ?? "-"}x
                </span>
              </td>
              <td className="px-3 py-2 tabular-nums">
                {video.engagementRate?.toFixed(2) ?? "-"}%
              </td>
              <td className="px-3 py-2 tabular-nums">
                {formatCount(video.likeCount)}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {formatCount(video.commentCount)}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {formatDate(video.publishedAt)}
              </td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">
                {formatDuration(video.duration)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
