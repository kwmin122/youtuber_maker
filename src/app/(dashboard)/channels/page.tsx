"use client";

import { useState } from "react";
import { ChannelImportForm } from "@/components/channel-import-form";
import { ChannelSearch } from "@/components/channel-search";
import { ChannelList } from "@/components/channel-list";

export default function ChannelsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">벤치마킹 채널</h1>
        <p className="text-muted-foreground mt-1">
          벤치마킹할 YouTube 채널을 추가하고 영상 데이터를
          수집합니다.
        </p>
      </div>

      <div className="space-y-6 rounded-lg border p-6">
        <ChannelImportForm onImported={handleRefresh} />
        <div className="border-t pt-6">
          <ChannelSearch onImported={handleRefresh} />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">내 채널 목록</h2>
        <ChannelList refreshKey={refreshKey} />
      </div>
    </div>
  );
}
