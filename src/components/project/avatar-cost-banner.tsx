"use client";

import { cn } from "@/lib/utils";

interface Props {
  totalMinutes: number;
  heygenUsd: string;
  didUsd: string;
}

export function AvatarCostBanner({ totalMinutes, heygenUsd, didUsd }: Props) {
  const isExpensive = parseFloat(heygenUsd) > 5;

  return (
    <div
      data-testid="avatar-cost-banner"
      className={cn(
        "rounded-lg border p-4 space-y-1",
        isExpensive ? "border-destructive bg-destructive/10" : "border-muted bg-muted/30"
      )}
    >
      <p className="text-sm font-medium">
        예상 비용 — 총 {totalMinutes.toFixed(1)}분
      </p>
      <div className="flex gap-4 text-sm">
        <span data-testid="heygen-cost">
          HeyGen <strong>${heygenUsd}</strong>
        </span>
        <span data-testid="did-cost">
          D-ID <strong>${didUsd}</strong>
        </span>
      </div>
      {isExpensive && (
        <p
          className="text-sm text-destructive font-medium"
          data-testid="cost-warning"
        >
          예상 비용이 $5를 초과합니다. 진행 전에 확인하세요.
        </p>
      )}
    </div>
  );
}
