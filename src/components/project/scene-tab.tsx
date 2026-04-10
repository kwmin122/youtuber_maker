"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SceneCard } from "./scene-card";
import { AvatarSubTab } from "./avatar-sub-tab";
import { Wand2, Loader2 } from "lucide-react";

interface Scene {
  id: string;
  sceneIndex: number;
  narration: string;
  imagePrompt: string;
  videoPrompt: string;
  duration: number | null;
  sourceType?: "manual" | "longform-clip";
  avatarPresetId?: string | null;
  avatarLayout?: {
    enabled: boolean;
    position: "bottom-right" | "bottom-left" | "center" | "top-right" | "fullscreen";
    scale: number;
    paddingPx: number;
  } | null;
  avatarVideoUrl?: string | null;
  avatarProviderTaskId?: string | null;
}

interface MediaAsset {
  id: string;
  sceneId: string;
  type: "image" | "video" | "audio";
  url: string;
  status: string;
  provider: string;
}

interface SceneTabProps {
  projectId: string;
}

export function SceneTab({ projectId }: SceneTabProps) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [assets, setAssets] = useState<Record<string, MediaAsset[]>>({});
  const [loading, setLoading] = useState(true);
  const [splitting, setSplitting] = useState(false);
  const [regeneratingScene, setRegeneratingScene] = useState<string | null>(null);

  const fetchScenes = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes`);
      const data = await res.json();
      setScenes(data.scenes ?? []);

      // Fetch assets for each scene
      const assetMap: Record<string, MediaAsset[]> = {};
      for (const scene of data.scenes ?? []) {
        const assetRes = await fetch(
          `/api/projects/${projectId}/scenes/${scene.id}/media`
        );
        const assetData = await assetRes.json();
        assetMap[scene.id] = assetData.assets ?? [];
      }
      setAssets(assetMap);
    } catch (error) {
      console.error("Failed to fetch scenes:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchScenes();
  }, [fetchScenes]);

  const handleSplitScenes = async () => {
    setSplitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "split-scenes",
          projectId,
          payload: { scriptId: "" }, // Will be resolved from selected script
        }),
      });

      if (res.ok) {
        // Poll for completion then refresh
        // For now, just refresh after a delay
        setTimeout(() => {
          fetchScenes();
          setSplitting(false);
        }, 5000);
      }
    } catch (error) {
      console.error("Failed to split scenes:", error);
      setSplitting(false);
    }
  };

  const handleRegenerate = async (
    sceneId: string,
    type: "image" | "video" | "audio"
  ) => {
    setRegeneratingScene(sceneId);
    try {
      await fetch(
        `/api/projects/${projectId}/scenes/${sceneId}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        }
      );
      // Poll for completion then refresh
      setTimeout(() => {
        fetchScenes();
        setRegeneratingScene(null);
      }, 5000);
    } catch (error) {
      console.error("Failed to regenerate:", error);
      setRegeneratingScene(null);
    }
  };

  const handleUpdateScene = async (
    sceneId: string,
    updates: Partial<Scene>
  ) => {
    try {
      await fetch(`/api/projects/${projectId}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      fetchScenes();
    } catch (error) {
      console.error("Failed to update scene:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (scenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <p className="text-muted-foreground">
          아직 장면이 없습니다. 대본을 장면으로 분할하세요.
        </p>
        <Button onClick={handleSplitScenes} disabled={splitting}>
          {splitting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4 mr-2" />
          )}
          AI 장면 분할
        </Button>
      </div>
    );
  }

  const scenesForAvatar = scenes.map((s) => ({
    id: s.id,
    sceneIndex: s.sceneIndex,
    duration: s.duration,
    narration: s.narration,
    sourceType: (s.sourceType ?? "manual") as "manual" | "longform-clip",
    avatarPresetId: s.avatarPresetId ?? null,
    avatarLayout: s.avatarLayout ?? null,
    avatarVideoUrl: s.avatarVideoUrl ?? null,
    avatarProviderTaskId: s.avatarProviderTaskId ?? null,
  }));

  const sceneList = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          장면 ({scenes.length}개)
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSplitScenes}
          disabled={splitting}
        >
          {splitting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4 mr-2" />
          )}
          다시 분할
        </Button>
      </div>

      <div className="grid gap-4">
        {scenes.map((scene) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            assets={assets[scene.id] ?? []}
            onRegenerate={handleRegenerate}
            onUpdateScene={handleUpdateScene}
            isRegenerating={regeneratingScene === scene.id}
          />
        ))}
      </div>
    </div>
  );

  return (
    <Tabs defaultValue="image" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="image">이미지</TabsTrigger>
        <TabsTrigger value="video">영상</TabsTrigger>
        <TabsTrigger value="audio">오디오</TabsTrigger>
        <TabsTrigger value="avatar">아바타</TabsTrigger>
      </TabsList>

      <TabsContent value="image">
        {sceneList}
      </TabsContent>
      <TabsContent value="video">
        {sceneList}
      </TabsContent>
      <TabsContent value="audio">
        {sceneList}
      </TabsContent>
      <TabsContent value="avatar">
        <AvatarSubTab projectId={projectId} scenes={scenesForAvatar} />
      </TabsContent>
    </Tabs>
  );
}
