"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AudioWaveform } from "./audio-waveform";
import { AudioLibraryDialog } from "./audio-library-dialog";
import type { AudioLibraryEntry } from "@/lib/video/types";
import { Music, Zap, Trash2, Upload } from "lucide-react";

interface AudioTrack {
  id: string;
  name: string;
  type: "bgm" | "sfx";
  url: string;
  startTime: number;
  endTime: number | null;
  volume: number;
}

interface AudioTrackManagerProps {
  projectId: string;
  tracks: AudioTrack[];
  onAddTrack: (data: {
    type: "bgm" | "sfx";
    name: string;
    libraryId?: string;
    file?: File;
  }) => void;
  onUpdateTrack: (
    trackId: string,
    data: { startTime?: number; endTime?: number | null; volume?: number }
  ) => void;
  onRemoveTrack: (trackId: string) => void;
}

export function AudioTrackManager({
  projectId: _projectId,
  tracks,
  onAddTrack,
  onUpdateTrack,
  onRemoveTrack,
}: AudioTrackManagerProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryType, setLibraryType] = useState<"bgm" | "sfx">("bgm");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleLibrarySelect(entry: AudioLibraryEntry) {
    onAddTrack({
      type: entry.type,
      name: entry.name,
      libraryId: entry.id,
    });
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    onAddTrack({
      type: "bgm",
      name: file.name.replace(/\.[^.]+$/, ""),
      file,
    });

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">배경음악 & 효과음</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLibraryType("bgm");
              setLibraryOpen(true);
            }}
          >
            <Music className="mr-1 h-3 w-3" />
            BGM 추가
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLibraryType("sfx");
              setLibraryOpen(true);
            }}
          >
            <Zap className="mr-1 h-3 w-3" />
            효과음 추가
          </Button>
        </div>
      </div>

      {/* Upload button */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.ogg"
          onChange={handleFileUpload}
          className="hidden"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-1 h-3 w-3" />
          직접 업로드
        </Button>
      </div>

      {/* Track list */}
      {tracks.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-4">
          추가된 오디오 트랙이 없습니다
        </p>
      ) : (
        <div className="space-y-3">
          {tracks.map((track) => (
            <div key={track.id} className="rounded-lg border p-3 space-y-2">
              {/* Header: name + type badge + delete */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{track.name}</span>
                  <Badge
                    variant="secondary"
                    className={
                      track.type === "bgm"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                        : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    }
                  >
                    {track.type === "bgm" ? "BGM" : "SFX"}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => onRemoveTrack(track.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Waveform */}
              <AudioWaveform audioUrl={track.url} height={40} />

              {/* Controls */}
              <div className="grid grid-cols-3 gap-3">
                {/* Volume */}
                <div className="space-y-1">
                  <Label className="text-[10px]">
                    볼륨 {Math.round(track.volume * 100)}%
                  </Label>
                  <Slider
                    value={[track.volume * 100]}
                    onValueChange={([val]) =>
                      onUpdateTrack(track.id, { volume: val / 100 })
                    }
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>

                {/* Start time */}
                <div className="space-y-1">
                  <Label className="text-[10px]">시작 (초)</Label>
                  <Input
                    type="number"
                    value={track.startTime}
                    onChange={(e) =>
                      onUpdateTrack(track.id, {
                        startTime: Number(e.target.value) || 0,
                      })
                    }
                    className="h-7 text-xs"
                    min={0}
                    step={0.5}
                  />
                </div>

                {/* End time */}
                <div className="space-y-1">
                  <Label className="text-[10px]">끝 (초)</Label>
                  <Input
                    type="number"
                    value={track.endTime ?? ""}
                    onChange={(e) =>
                      onUpdateTrack(track.id, {
                        endTime: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    className="h-7 text-xs"
                    min={0}
                    step={0.5}
                    placeholder="끝까지"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Audio Library Dialog */}
      <AudioLibraryDialog
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        type={libraryType}
        onSelect={handleLibrarySelect}
      />
    </div>
  );
}
