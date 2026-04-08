"use client";

import { useState, useCallback } from "react";

interface AudioTrack {
  id: string;
  name: string;
  type: "bgm" | "sfx";
  url: string;
  startTime: number;
  endTime: number | null;
  volume: number;
}

interface AddTrackData {
  type: "bgm" | "sfx";
  name: string;
  libraryId?: string;
  file?: File;
}

interface UpdateTrackData {
  startTime?: number;
  endTime?: number | null;
  volume?: number;
}

export function useAudioTracks(projectId: string) {
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Fetch all audio tracks for this project */
  const fetchTracks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/audio-tracks`);
      if (!res.ok) throw new Error("Failed to fetch audio tracks");
      const data = await res.json();
      setTracks(data.tracks ?? data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tracks");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  /** Add a track from library or upload */
  const addTrack = useCallback(
    async (data: AddTrackData) => {
      setLoading(true);
      setError(null);
      try {
        let body: BodyInit;
        const headers: Record<string, string> = {};

        if (data.file) {
          const formData = new FormData();
          formData.append("file", data.file);
          formData.append("type", data.type);
          formData.append("name", data.name);
          body = formData;
        } else {
          headers["Content-Type"] = "application/json";
          body = JSON.stringify({
            type: data.type,
            name: data.name,
            libraryId: data.libraryId,
          });
        }

        const res = await fetch(
          `/api/projects/${projectId}/audio-tracks`,
          { method: "POST", headers, body }
        );
        if (!res.ok) throw new Error("Failed to add audio track");
        const newTrack = await res.json();
        setTracks((prev) => [...prev, newTrack]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add track");
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  /** Update track timing/volume */
  const updateTrack = useCallback(
    async (trackId: string, data: UpdateTrackData) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/audio-tracks/${trackId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          }
        );
        if (!res.ok) throw new Error("Failed to update track");
        const updated = await res.json();
        setTracks((prev) =>
          prev.map((t) => (t.id === trackId ? { ...t, ...updated } : t))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update track");
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  /** Remove a track */
  const removeTrack = useCallback(
    async (trackId: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/audio-tracks/${trackId}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error("Failed to remove track");
        setTracks((prev) => prev.filter((t) => t.id !== trackId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove track");
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  return { tracks, loading, error, fetchTracks, addTrack, updateTrack, removeTrack };
}
