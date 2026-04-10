"use client";

import type { UploadPlatform } from "@/lib/distribution/types";

interface PlatformSelectorProps {
  selected: UploadPlatform;
  onSelect: (platform: UploadPlatform) => void;
}

interface PlatformConfig {
  id: UploadPlatform;
  label: string;
  icon: string;
  color: string;
  activeColor: string;
  enabled: boolean;
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: "youtube",
    label: "YouTube",
    icon: "▶",
    color: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
    activeColor:
      "ring-2 ring-red-500 border-red-500 bg-red-50 dark:bg-red-950/50",
    enabled: true,
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: "♪",
    color: "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/30",
    activeColor: "",
    enabled: false,
  },
  {
    id: "reels",
    label: "Instagram Reels",
    icon: "◎",
    color: "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/30",
    activeColor: "",
    enabled: false,
  },
];

export function PlatformSelector({
  selected,
  onSelect,
}: PlatformSelectorProps) {
  return (
    <div className="flex gap-3">
      {PLATFORMS.map((platform) => {
        const isSelected = selected === platform.id;
        const isDisabled = !platform.enabled;

        return (
          <button
            key={platform.id}
            type="button"
            disabled={isDisabled}
            onClick={() => {
              if (platform.enabled) {
                onSelect(platform.id);
              }
            }}
            className={`relative flex flex-1 flex-col items-center gap-2 rounded-lg border p-4 text-center transition-all ${
              isDisabled
                ? `cursor-not-allowed opacity-50 grayscale ${platform.color}`
                : isSelected
                  ? platform.activeColor
                  : `cursor-pointer hover:shadow-sm ${platform.color}`
            }`}
            aria-label={platform.label}
          >
            <span className="text-2xl">{platform.icon}</span>
            <span className="text-sm font-medium">{platform.label}</span>

            {isDisabled && (
              <span className="absolute -top-2 right-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Coming Soon
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
