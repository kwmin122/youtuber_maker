"use client";

import { useRef, useState } from "react";
import type { AudioLibraryEntry } from "@/lib/video/types";
import { getAudioLibrary } from "@/lib/video/audio-library";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause } from "lucide-react";

interface AudioLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  type: "bgm" | "sfx";
  onSelect: (entry: AudioLibraryEntry) => void;
}

export function AudioLibraryDialog({
  open,
  onClose,
  type,
  onSelect,
}: AudioLibraryDialogProps) {
  const entries = getAudioLibrary(type);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function handlePlay(entry: AudioLibraryEntry) {
    if (playingId === entry.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(entry.url);
    audio.onended = () => setPlayingId(null);
    audio.play().catch(() => {
      // Audio may not be available in dev
    });
    audioRef.current = audio;
    setPlayingId(entry.id);
  }

  function handleSelect(entry: AudioLibraryEntry) {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingId(null);
    onSelect(entry);
    onClose();
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingId(null);
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {type === "bgm" ? "BGM 라이브러리" : "효과음 라이브러리"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              {/* Play preview */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => handlePlay(entry)}
              >
                {playingId === entry.id ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{entry.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="secondary" className="text-[10px]">
                    {entry.category}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {entry.duration}초
                  </span>
                </div>
              </div>

              {/* Select button */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSelect(entry)}
              >
                선택
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
