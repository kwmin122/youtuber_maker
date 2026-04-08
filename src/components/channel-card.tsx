"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Channel = {
  id: string;
  title: string;
  handle?: string | null;
  thumbnailUrl?: string | null;
  subscriberCount?: number | null;
  videoCount?: number | null;
  viewCount?: number | null;
};

type Props = {
  channel: Channel;
  onDeleted?: () => void;
};

function formatCount(count?: number | null): string {
  if (!count) return "-";
  if (count >= 1_000_000_000)
    return `${(count / 1_000_000_000).toFixed(1)}B`;
  if (count >= 1_000_000)
    return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

export function ChannelCard({ channel, onDeleted }: Props) {
  async function handleDelete() {
    if (!confirm(`"${channel.title}" 채널을 삭제하시겠습니까?`))
      return;
    try {
      const res = await fetch(`/api/channels/${channel.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("삭제 실패");
      toast.success("채널이 삭제되었습니다");
      onDeleted?.();
    } catch {
      toast.error("채널 삭제 실패");
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border p-4 hover:bg-accent/50 transition-colors">
      <Link
        href={`/channels/${channel.id}`}
        className="flex items-center gap-4 flex-1 min-w-0"
      >
        {channel.thumbnailUrl ? (
          <img
            src={channel.thumbnailUrl}
            alt={channel.title}
            className="h-12 w-12 rounded-full shrink-0"
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-muted shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{channel.title}</p>
          {channel.handle && (
            <p className="text-sm text-muted-foreground">
              @{channel.handle}
            </p>
          )}
        </div>
        <div className="flex gap-6 text-sm text-muted-foreground shrink-0">
          <div className="text-center">
            <p className="font-medium text-foreground">
              {formatCount(channel.subscriberCount)}
            </p>
            <p className="text-xs">구독자</p>
          </div>
          <div className="text-center">
            <p className="font-medium text-foreground">
              {formatCount(channel.videoCount)}
            </p>
            <p className="text-xs">영상</p>
          </div>
          <div className="text-center">
            <p className="font-medium text-foreground">
              {formatCount(channel.viewCount)}
            </p>
            <p className="text-xs">조회수</p>
          </div>
        </div>
      </Link>
      <Button
        size="icon"
        variant="ghost"
        onClick={handleDelete}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
