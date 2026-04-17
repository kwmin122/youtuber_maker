"use client";

import { ExternalLink } from "lucide-react";

interface VideoPerformanceTableProps {
  uploads: Array<{
    id: string;
    title: string;
    platform: string;
    youtubeVideoId: string | null;
    tiktokVideoId?: string | null;
    reelsVideoId?: string | null;
    videoUrl: string | null;
    status: string;
    uploadedAt: string | null;
    viewCount: number;
    likeCount: number;
    commentCount: number;
  }>;
}

function abbreviateNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

const STATUS_STYLES: Record<string, string> = {
  completed:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  uploading:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  scheduled:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  pending:
    "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  processing:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse",
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const label =
    platform === "youtube" ? "YouTube" : platform === "tiktok" ? "TikTok" : "Instagram";
  const colorClass =
    platform === "youtube"
      ? "bg-red-100 text-red-700"
      : platform === "tiktok"
        ? "bg-gray-900 text-white"
        : "bg-purple-100 text-purple-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${colorClass}`}
    >
      {label}
    </span>
  );
}

export function VideoPerformanceTable({ uploads }: VideoPerformanceTableProps) {
  if (!uploads || uploads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No uploads yet. Export a video and upload it to YouTube.
        </p>
      </div>
    );
  }

  const sorted = [...uploads].sort((a, b) => {
    const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
    const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
    return dateB - dateA;
  });

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left font-medium">Title</th>
            <th className="px-4 py-3 text-left font-medium">Platform</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Views</th>
            <th className="px-4 py-3 text-right font-medium">Likes</th>
            <th className="px-4 py-3 text-right font-medium">Comments</th>
            <th className="px-4 py-3 text-left font-medium">Uploaded At</th>
            <th className="px-4 py-3 text-center font-medium">Link</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((upload) => (
            <tr
              key={upload.id}
              className="border-b transition-colors hover:bg-muted/30"
            >
              <td className="max-w-[200px] truncate px-4 py-3 font-medium">
                {upload.title}
              </td>
              <td className="px-4 py-3">
                <PlatformBadge platform={upload.platform} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={upload.status} />
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {abbreviateNumber(upload.viewCount)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {abbreviateNumber(upload.likeCount)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {abbreviateNumber(upload.commentCount)}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDate(upload.uploadedAt)}
              </td>
              <td className="px-4 py-3 text-center">
                {upload.status === "completed" && upload.videoUrl ? (
                  <a
                    href={upload.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">--</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
