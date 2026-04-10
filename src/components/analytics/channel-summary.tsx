"use client";

import { Upload, Eye, ThumbsUp, MessageCircle, Zap } from "lucide-react";

interface ChannelSummaryProps {
  totalUploads: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  avgViralScore: number | null;
}

function abbreviateNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-4 transition-shadow hover:shadow-md">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export function ChannelSummary({
  totalUploads,
  totalViews,
  totalLikes,
  totalComments,
  avgViralScore,
}: ChannelSummaryProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard
        icon={<Upload className="h-5 w-5 text-primary" />}
        label="Uploads"
        value={String(totalUploads)}
      />
      <StatCard
        icon={<Eye className="h-5 w-5 text-blue-500" />}
        label="Views"
        value={abbreviateNumber(totalViews)}
      />
      <StatCard
        icon={<ThumbsUp className="h-5 w-5 text-green-500" />}
        label="Likes"
        value={abbreviateNumber(totalLikes)}
      />
      <StatCard
        icon={<MessageCircle className="h-5 w-5 text-orange-500" />}
        label="Comments"
        value={abbreviateNumber(totalComments)}
      />
      <StatCard
        icon={<Zap className="h-5 w-5 text-yellow-500" />}
        label="Avg Viral Score"
        value={avgViralScore !== null ? `${Math.round(avgViralScore)}/100` : "--"}
      />
    </div>
  );
}
