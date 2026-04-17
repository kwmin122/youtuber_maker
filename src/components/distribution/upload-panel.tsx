"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PlatformSelector } from "./platform-selector";
import { ScheduledUploadPicker } from "./scheduled-upload-picker";
import { UploadProgress } from "./upload-progress";
import { Upload, ExternalLink } from "lucide-react";
import type {
  UploadPlatform,
  PrivacyStatus,
  SEOResult,
} from "@/lib/distribution/types";

interface UploadPanelProps {
  projectId: string;
  hasExportedVideo: boolean;
  seo: SEOResult | null;
  selectedThumbnailId: string | null;
  supabaseJwt: string | null;
}

interface UploadHistoryItem {
  id: string;
  platform: string;
  title: string;
  status: string;
  videoUrl: string | null;
  uploadedAt: string | null;
  createdAt: string;
}

interface PlatformConfig {
  tiktokConfigured: boolean;
  instagramConfigured: boolean;
}

export function UploadPanel({
  projectId,
  hasExportedVideo,
  seo,
  selectedThumbnailId,
  supabaseJwt,
}: UploadPanelProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<UploadPlatform[]>(["youtube"]);
  const [platformJobs, setPlatformJobs] = useState<Record<UploadPlatform, string | null>>({
    youtube: null,
    tiktok: null,
    reels: null,
  });
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>({
    tiktokConfigured: false,
    instagramConfigured: false,
  });
  const [privacyStatus, setPrivacyStatus] =
    useState<PrivacyStatus>("private");
  const [publishAt, setPublishAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<UploadHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Fetch platform config (tiktokConfigured, instagramConfigured) on mount
  useEffect(() => {
    async function fetchPlatformConfig() {
      try {
        const res = await fetch("/api/auth/connected-accounts");
        if (res.ok) {
          const data = await res.json();
          setPlatformConfig({
            tiktokConfigured: data.tiktokConfigured ?? false,
            instagramConfigured: data.instagramConfigured ?? false,
          });
        }
      } catch {
        // Silent failure — defaults remain false
      }
    }
    fetchPlatformConfig();
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/upload`);
      if (res.ok) {
        const data = await res.json();
        setHistory(Array.isArray(data) ? data : data.uploads ?? []);
      }
    } catch {
      // Silent
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  function handleTogglePlatform(p: UploadPlatform) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  async function handleUpload() {
    if (!seo) {
      setError("Please generate SEO metadata first.");
      return;
    }

    if (selectedPlatforms.length === 0) {
      setError("Please select at least one platform.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: seo.title,
          description: seo.description,
          tags: seo.tags,
          privacyStatus,
          publishAt: publishAt ?? undefined,
          thumbnailId: selectedThumbnailId ?? undefined,
          platforms: selectedPlatforms,
          privacyLevel: "SELF_ONLY",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Upload failed");
        return;
      }

      const data = await res.json() as { jobs: Array<{ platform: string; jobId: string }> };
      setPlatformJobs((prev) => {
        const next = { ...prev };
        for (const j of data.jobs) {
          next[j.platform as UploadPlatform] = j.jobId;
        }
        return next;
      });

      // Refresh history after starting jobs
      fetchHistory();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasExportedVideo) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium">Export your video first</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Export your video first before uploading.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Platform selector */}
      <div className="space-y-2">
        <Label>Platform</Label>
        <PlatformSelector
          selected={selectedPlatforms}
          onToggle={handleTogglePlatform}
          tiktokConfigured={platformConfig.tiktokConfigured}
          instagramConfigured={platformConfig.instagramConfigured}
        />
      </div>

      {/* Privacy status */}
      <div className="space-y-2">
        <Label>Privacy Status</Label>
        <RadioGroup
          value={privacyStatus}
          onValueChange={(v) => setPrivacyStatus(v as PrivacyStatus)}
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="public" id="privacy-public" />
            <Label htmlFor="privacy-public" className="cursor-pointer text-sm">
              Public
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="unlisted" id="privacy-unlisted" />
            <Label
              htmlFor="privacy-unlisted"
              className="cursor-pointer text-sm"
            >
              Unlisted
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="private" id="privacy-private" />
            <Label htmlFor="privacy-private" className="cursor-pointer text-sm">
              Private
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Scheduled upload */}
      <ScheduledUploadPicker value={publishAt} onChange={setPublishAt} />

      {/* Upload button */}
      <div className="space-y-2">
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          onClick={handleUpload}
          disabled={submitting || !seo || selectedPlatforms.length === 0}
          className="w-full"
        >
          <Upload className="mr-2 h-4 w-4" />
          {submitting ? "Submitting..." : "업로드 시작"}
        </Button>
      </div>

      {/* Per-platform upload progress */}
      {selectedPlatforms.map((p) =>
        platformJobs[p] ? (
          <div key={p} className="space-y-1">
            <p className="text-xs font-semibold capitalize text-muted-foreground">{p}</p>
            <UploadProgress
              jobId={platformJobs[p]!}
              supabaseJwt={supabaseJwt}
              onRetry={handleUpload}
            />
          </div>
        ) : null
      )}

      {/* Upload history */}
      <div className="space-y-3">
        <Label>Upload History</Label>
        {historyLoading ? (
          <p className="text-xs text-muted-foreground">Loading...</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No previous uploads for this project.
          </p>
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.status} -{" "}
                    {item.uploadedAt
                      ? new Date(item.uploadedAt).toLocaleDateString()
                      : new Date(item.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {item.status === "completed" && item.videoUrl && (
                  <a
                    href={item.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
