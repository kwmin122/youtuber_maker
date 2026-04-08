"use client";

import { useEffect, useState, useCallback } from "react";
import { ChannelCard } from "./channel-card";
import { Loader2 } from "lucide-react";

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
  refreshKey?: number; // increment to trigger refresh
};

export function ChannelList({ refreshKey }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/channels");
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels, refreshKey]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>추가된 채널이 없습니다.</p>
        <p className="text-sm mt-1">
          위에서 채널 URL을 입력하거나 키워드로 검색하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {channels.map((ch) => (
        <ChannelCard
          key={ch.id}
          channel={ch}
          onDeleted={fetchChannels}
        />
      ))}
    </div>
  );
}
