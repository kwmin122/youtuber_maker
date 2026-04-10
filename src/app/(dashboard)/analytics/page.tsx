"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChannelSummary } from "@/components/analytics/channel-summary";
import { MetricsChart } from "@/components/analytics/metrics-chart";
import { VideoPerformanceTable } from "@/components/analytics/video-performance-table";
import { BarChart3 } from "lucide-react";

interface UploadRow {
  id: string;
  title: string;
  platform: string;
  youtubeVideoId: string | null;
  videoUrl: string | null;
  status: string;
  uploadedAt: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

interface MetricsPoint {
  date: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

interface AnalyticsData {
  uploads: UploadRow[];
  metrics: MetricsPoint[];
  summary: {
    totalUploads: number;
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    avgViralScore: number | null;
  };
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        // Fetch all projects first to gather upload data
        const projectsRes = await fetch("/api/projects");
        if (!projectsRes.ok) {
          setError("Failed to fetch projects");
          return;
        }
        const projectsData = await projectsRes.json();
        const projectList =
          projectsData.projects ?? projectsData ?? [];

        const allUploads: UploadRow[] = [];
        const metricsMap = new Map<string, MetricsPoint>();
        let totalViews = 0;
        let totalLikes = 0;
        let totalComments = 0;

        // Fetch uploads for each project
        for (const project of projectList) {
          try {
            const uploadsRes = await fetch(
              `/api/projects/${project.id}/upload`
            );
            if (uploadsRes.ok) {
              const uploads = await uploadsRes.json();
              const uploadList = Array.isArray(uploads)
                ? uploads
                : uploads.uploads ?? [];
              for (const upload of uploadList) {
                allUploads.push({
                  id: upload.id,
                  title: upload.title ?? project.title,
                  platform: upload.platform ?? "youtube",
                  youtubeVideoId: upload.youtubeVideoId ?? null,
                  videoUrl: upload.videoUrl ?? null,
                  status: upload.status ?? "pending",
                  uploadedAt: upload.uploadedAt ?? null,
                  viewCount: 0,
                  likeCount: 0,
                  commentCount: 0,
                });
              }
            }
          } catch {
            // Skip failed project fetches
          }
        }

        // Aggregate metrics from uploads for the chart
        for (const upload of allUploads) {
          if (upload.uploadedAt) {
            const dateKey = upload.uploadedAt.split("T")[0];
            const existing = metricsMap.get(dateKey) ?? {
              date: dateKey,
              viewCount: 0,
              likeCount: 0,
              commentCount: 0,
            };
            existing.viewCount += upload.viewCount;
            existing.likeCount += upload.likeCount;
            existing.commentCount += upload.commentCount;
            metricsMap.set(dateKey, existing);
          }
          totalViews += upload.viewCount;
          totalLikes += upload.likeCount;
          totalComments += upload.commentCount;
        }

        const metrics = Array.from(metricsMap.values()).sort(
          (a, b) => a.date.localeCompare(b.date)
        );

        setData({
          uploads: allUploads,
          metrics,
          summary: {
            totalUploads: allUploads.length,
            totalViews,
            totalLikes,
            totalComments,
            avgViralScore: null,
          },
        });
      } catch {
        setError("Failed to load analytics data");
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
        <div className="flex items-center justify-center p-12">
          <p className="text-sm text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
        <div className="rounded-lg border border-destructive/50 p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || data.uploads.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-16 text-center">
          <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold">No uploads yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Upload your first video to see analytics here.
          </p>
          <Link
            href="/projects"
            className="mt-4 text-sm font-medium text-primary hover:underline"
          >
            Go to Projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Analytics Dashboard</h1>

      <ChannelSummary
        totalUploads={data.summary.totalUploads}
        totalViews={data.summary.totalViews}
        totalLikes={data.summary.totalLikes}
        totalComments={data.summary.totalComments}
        avgViralScore={data.summary.avgViralScore}
      />

      <MetricsChart
        data={data.metrics}
        title="Performance Over Time"
      />

      <div>
        <h2 className="mb-4 text-lg font-semibold">Upload History</h2>
        <VideoPerformanceTable uploads={data.uploads} />
      </div>
    </div>
  );
}
