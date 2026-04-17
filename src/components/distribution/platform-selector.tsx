"use client";

import type { UploadPlatform } from "@/lib/distribution/types";
import { Checkbox } from "@/components/ui/checkbox";

interface PlatformSelectorProps {
  selected: UploadPlatform[];
  onToggle: (platform: UploadPlatform) => void;
  tiktokConfigured?: boolean;
  instagramConfigured?: boolean;
}

interface PlatformConfig {
  id: UploadPlatform;
  label: string;
  icon: string;
  color: string;
  activeColor: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: "youtube",
    label: "YouTube",
    icon: "▶",
    color: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
    activeColor:
      "ring-2 ring-primary border-red-500 bg-red-50 dark:bg-red-950/50",
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: "♪",
    color: "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/30",
    activeColor: "ring-2 ring-primary border-gray-500",
  },
  {
    id: "reels",
    label: "Instagram Reels",
    icon: "◎",
    color: "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/30",
    activeColor: "ring-2 ring-primary border-purple-500",
  },
];

export function PlatformSelector({
  selected,
  onToggle,
  tiktokConfigured = false,
  instagramConfigured = false,
}: PlatformSelectorProps) {
  function isPlatformEnabled(id: UploadPlatform): boolean {
    if (id === "youtube") return true;
    if (id === "tiktok") return tiktokConfigured;
    if (id === "reels") return instagramConfigured;
    return false;
  }

  function getNotConfiguredLabel(id: UploadPlatform): string | null {
    if (id === "tiktok" && !tiktokConfigured) return "Coming Soon";
    if (id === "reels" && !instagramConfigured) return "Coming Soon";
    return null;
  }

  return (
    <div className="flex gap-3">
      {PLATFORMS.map((platform) => {
        const isEnabled = isPlatformEnabled(platform.id);
        const isSelected = selected.includes(platform.id);
        const notConfiguredLabel = getNotConfiguredLabel(platform.id);

        return (
          <button
            key={platform.id}
            type="button"
            disabled={!isEnabled}
            onClick={() => {
              if (isEnabled) {
                onToggle(platform.id);
              }
            }}
            className={`relative flex flex-1 flex-col items-center gap-2 rounded-lg border p-4 text-center transition-all ${
              !isEnabled
                ? `cursor-not-allowed opacity-50 grayscale ${platform.color}`
                : isSelected
                  ? platform.activeColor
                  : `cursor-pointer hover:shadow-sm ${platform.color}`
            }`}
            aria-label={platform.label}
          >
            {/* Checkbox positioned top-left */}
            <div className="absolute left-2 top-2">
              <Checkbox
                checked={isSelected}
                disabled={!isEnabled}
                onCheckedChange={() => {
                  if (isEnabled) onToggle(platform.id);
                }}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${platform.label}`}
              />
            </div>

            <span className="text-2xl">{platform.icon}</span>
            <span className="text-sm font-medium">{platform.label}</span>

            {notConfiguredLabel && (
              <span className="absolute -top-2 right-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {notConfiguredLabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
