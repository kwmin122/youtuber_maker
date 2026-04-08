"use client";

import { useRef, useEffect } from "react";
// wavesurfer.js - audio waveform visualization
import WaveSurfer from "wavesurfer.js";

interface AudioWaveformProps {
  audioUrl: string;
  height?: number;
  waveColor?: string;
  progressColor?: string;
  onReady?: (duration: number) => void;
}

export function AudioWaveform({
  audioUrl,
  height = 48,
  waveColor = "#8884d8",
  progressColor = "#6366f1",
  onReady,
}: AudioWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: waveColor,
      progressColor: progressColor,
      height: height,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      cursorWidth: 0,
      interact: false,
    });

    ws.load(audioUrl);
    ws.on("ready", () => onReady?.(ws.getDuration()));
    wavesurferRef.current = ws;

    return () => ws.destroy();
  }, [audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      className="w-full rounded bg-muted/30"
      style={{ minHeight: `${height}px` }}
    />
  );
}
