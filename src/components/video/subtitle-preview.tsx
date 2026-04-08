"use client";

import type { SubtitleStyle } from "@/lib/video/types";

interface SubtitlePreviewProps {
  narrationText: string;
  style: SubtitleStyle;
}

function getPositionStyle(position: SubtitleStyle["position"]): React.CSSProperties {
  switch (position) {
    case "top":
      return { top: "10%", left: "50%", transform: "translateX(-50%)" };
    case "center":
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    case "bottom":
    default:
      return { bottom: "15%", left: "50%", transform: "translateX(-50%)" };
  }
}

export function SubtitlePreview({ narrationText, style }: SubtitlePreviewProps) {
  const positionStyle = getPositionStyle(style.position);

  const textStyle: React.CSSProperties = {
    fontFamily: style.fontFamily,
    fontSize: `${Math.round(style.fontSize * 0.5)}px`, // Scaled down for preview
    color: style.fontColor,
    backgroundColor: style.backgroundColor,
    padding: "4px 8px",
    borderRadius: "4px",
    textAlign: "center" as const,
    maxWidth: "90%",
    wordBreak: "keep-all" as const,
    WebkitTextStroke:
      style.borderWidth > 0
        ? `${style.borderWidth * 0.5}px ${style.borderColor}`
        : undefined,
    textShadow:
      style.shadowOffset > 0
        ? `${style.shadowOffset}px ${style.shadowOffset}px ${style.shadowOffset}px ${style.shadowColor}`
        : undefined,
  };

  return (
    <div
      className="relative mx-auto overflow-hidden rounded-lg bg-zinc-900"
      style={{ width: "270px", height: "480px" }}
    >
      {/* Simulated video background */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 to-zinc-900" />

      {/* 9:16 label */}
      <div className="absolute right-2 top-2 rounded bg-zinc-700/50 px-1.5 py-0.5 text-[9px] text-zinc-400">
        9:16
      </div>

      {/* Subtitle text with styling */}
      <div className="absolute" style={positionStyle}>
        <span style={textStyle}>{narrationText || "자막 미리보기"}</span>
      </div>
    </div>
  );
}
