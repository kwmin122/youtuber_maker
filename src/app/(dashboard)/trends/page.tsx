"use client";

import { TrendDashboard } from "@/components/trends/trend-dashboard";

export default function TrendsPage() {
  return (
    <div className="container mx-auto max-w-5xl py-8 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">트렌드 인텔리전스</h1>
        <p className="text-muted-foreground mt-1">
          YouTube 급상승 키워드를 실시간으로 분석하고 미개척 콘텐츠 기회를 탐지합니다.
        </p>
      </div>
      <TrendDashboard />
    </div>
  );
}
