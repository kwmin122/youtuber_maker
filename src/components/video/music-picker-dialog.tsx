"use client";

import React, { useState, useRef } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Pause, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENRES = [
  "",
  "beats",
  "cinematic",
  "corporate",
  "electronic",
  "folk",
  "hip-hop",
  "jazz",
  "lofi",
  "pop",
  "rock",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PixabayTrack {
  id: number;
  title: string;
  artist: string;
  url: string;
  previewUrl: string;
  duration: number;
}

export interface MusicPickerDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onTrackAdded: (track: {
    id: string;
    name: string;
    type: "bgm";
    url: string;
    startTime: number;
    endTime: number | null;
    volume: number;
  }) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MusicPickerDialog(props: MusicPickerDialogProps): React.JSX.Element {
  const { open, onClose, projectId, onTrackAdded } = props;

  // Tab state
  const [activeTab, setActiveTab] = useState<"search" | "upload">("search");

  // Search tab state
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [tracks, setTracks] = useState<PixabayTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);

  // Upload tab state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleSearch() {
    setSearching(true);
    setSearchError(null);

    try {
      const res = await fetch(
        `/api/music/search?q=${encodeURIComponent(query)}&genre=${encodeURIComponent(genre)}`
      );

      if (!res.ok) {
        setSearchError("검색 중 오류가 발생했습니다");
        return;
      }

      const data = (await res.json()) as { tracks: PixabayTrack[] };
      setTracks(data.tracks);
    } catch {
      setSearchError("검색 중 오류가 발생했습니다");
    } finally {
      setSearching(false);
    }
  }

  function handlePreview(track: PixabayTrack) {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(track.previewUrl);
    audio.onended = () => setPlayingId(null);
    audio.play().catch(() => {
      // Silently handle play errors (e.g., in dev/test environments)
    });
    audioRef.current = audio;
    setPlayingId(track.id);
  }

  async function handleAddPixabay(track: PixabayTrack) {
    setAddingId(track.id);

    try {
      const res = await fetch(
        `/api/projects/${projectId}/audio-tracks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "bgm",
            name: `${track.title} — ${track.artist}`,
            url: track.url,
            startTime: 0,
            volume: 0.3,
          }),
        }
      );

      if (!res.ok) {
        toast.error("트랙 추가에 실패했습니다");
        return;
      }

      const data = (await res.json()) as {
        track: {
          id: string;
          name: string;
          type: "bgm";
          url: string;
          startTime: number;
          endTime: number | null;
          volume: number;
        };
      };

      onTrackAdded(data.track);
      handleDialogClose();
    } catch (err) {
      console.error("handleAddPixabay error:", err);
      toast.error("트랙 추가 중 오류가 발생했습니다");
    } finally {
      setAddingId(null);
    }
  }

  async function handleUpload() {
    if (!uploadFile) return;

    // Validate MIME type
    if (
      uploadFile.type !== "audio/mpeg" &&
      uploadFile.type !== "audio/wav" &&
      uploadFile.type !== "audio/x-wav"
    ) {
      setUploadError("MP3 또는 WAV 파일만 업로드할 수 있습니다");
      return;
    }

    // Validate file size (50 MB)
    if (uploadFile.size > 52_428_800) {
      setUploadError("파일 크기는 최대 50MB까지 허용됩니다");
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("type", "bgm");
      formData.append(
        "name",
        uploadName || uploadFile.name.replace(/\.[^.]+$/, "")
      );
      formData.append("startTime", "0");
      formData.append("volume", "0.3");

      const res = await fetch(`/api/projects/${projectId}/audio-tracks`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        setUploadError("업로드 중 오류가 발생했습니다");
        return;
      }

      const data = (await res.json()) as {
        track: {
          id: string;
          name: string;
          type: "bgm";
          url: string;
          startTime: number;
          endTime: number | null;
          volume: number;
        };
      };

      onTrackAdded(data.track);
      handleDialogClose();
    } catch (err) {
      console.error("handleUpload error:", err);
      setUploadError("업로드 중 오류가 발생했습니다");
    } finally {
      setUploading(false);
    }
  }

  function handleDialogClose() {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingId(null);
    onClose();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleDialogClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>음악 추가</DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as "search" | "upload")}
        >
          <TabsList>
            <TabsTrigger value="search">Pixabay 검색</TabsTrigger>
            <TabsTrigger value="upload">직접 업로드</TabsTrigger>
          </TabsList>

          {/* ---------------------------------------------------------------- */}
          {/* Tab 1: Pixabay search                                             */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="search">
            <div className="space-y-3">
              {/* Search controls */}
              <div className="flex gap-2">
                <Input
                  placeholder="키워드 검색..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSearch();
                  }}
                  className="flex-1"
                />

                <Select
                  value={genre}
                  onValueChange={setGenre}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="장르" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENRES.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g === "" ? "전체" : g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button onClick={() => void handleSearch()} disabled={searching}>
                  {searching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "검색"
                  )}
                </Button>
              </div>

              {/* Status messages */}
              {searching && (
                <p className="text-sm text-muted-foreground">검색 중...</p>
              )}
              {searchError && (
                <p className="text-sm text-destructive">{searchError}</p>
              )}
              {!searching && !searchError && tracks.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  검색 결과가 없습니다
                </p>
              )}

              {/* Results list */}
              {tracks.length > 0 && (
                <div className="max-h-[400px] overflow-y-auto">
                  <div className="space-y-2 pr-1">
                    {tracks.map((track) => (
                      <div
                        key={track.id}
                        className="flex items-center gap-3 rounded-lg border p-3"
                      >
                        {/* Preview button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 flex-shrink-0"
                          onClick={() => handlePreview(track)}
                        >
                          {playingId === track.id ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>

                        {/* Track info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {track.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {track.artist} · {track.duration}초
                          </p>
                        </div>

                        {/* Add button */}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={addingId === track.id}
                          onClick={() => void handleAddPixabay(track)}
                        >
                          {addingId === track.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "트랙에 추가"
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* Tab 2: File upload                                                */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="upload">
            <div className="space-y-4">
              {/* File picker */}
              <div className="space-y-2">
                <Label htmlFor="music-file-input">
                  파일 선택 (MP3 또는 WAV, 최대 50MB)
                </Label>
                <Input
                  id="music-file-input"
                  type="file"
                  accept=".mp3,.wav"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setUploadFile(file);
                    if (file) {
                      setUploadName(file.name.replace(/\.[^.]+$/, ""));
                    }
                  }}
                />
              </div>

              {/* Track name */}
              <div className="space-y-2">
                <Label htmlFor="music-track-name">트랙 이름</Label>
                <Input
                  id="music-track-name"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="트랙 이름을 입력하세요"
                />
              </div>

              {/* Error message */}
              {uploadError && (
                <p className="text-sm text-destructive">{uploadError}</p>
              )}

              {/* Upload button */}
              <Button
                onClick={() => void handleUpload()}
                disabled={!uploadFile || uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    업로드 중...
                  </>
                ) : (
                  "업로드 및 추가"
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
