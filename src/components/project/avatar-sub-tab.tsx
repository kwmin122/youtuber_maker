"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AvatarLibraryGrid } from "./avatar-library-grid";
import { AvatarReferenceUpload } from "./avatar-reference-upload";
import { AvatarProjectDefault } from "./avatar-project-default";
import { AvatarSceneList } from "./avatar-scene-list";
import { AvatarCostBanner } from "./avatar-cost-banner";

export type AvatarPreset = {
  id: string;
  userId: string | null;
  provider: "heygen" | "did";
  providerAvatarId: string;
  gender: "male" | "female" | "neutral";
  ageGroup: "youth" | "adult" | "senior";
  style: "realistic" | "cartoon" | "anime" | "business";
  previewImageUrl: string;
  source: "library" | "custom";
};

export type Scene = {
  id: string;
  sceneIndex: number;
  duration: number | null;
  narration: string;
  sourceType: "manual" | "longform-clip";
  avatarPresetId: string | null;
  avatarLayout: {
    enabled: boolean;
    position: "bottom-right" | "bottom-left" | "center" | "top-right" | "fullscreen";
    scale: number;
    paddingPx: number;
  } | null;
  avatarVideoUrl: string | null;
  avatarProviderTaskId: string | null;
};

export interface AvatarSubTabProps {
  projectId: string;
  scenes: Scene[];
}

export function AvatarSubTab({ projectId, scenes: initialScenes }: AvatarSubTabProps) {
  const [presets, setPresets] = useState<AvatarPreset[]>([]);
  const [scenes, setScenes] = useState<Scene[]>(initialScenes);
  const [defaultPresetId, setDefaultPresetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch("/api/avatar/presets");
      if (res.ok) {
        setPresets(await res.json());
      }
      setLoading(false);
    })();
  }, []);

  const estimate = useMemo(() => {
    const totalMinutes = scenes.reduce((s, sc) => s + (sc.duration ?? 0), 0) / 60;
    const heygen = (totalMinutes * 1.0).toFixed(2);
    const did = (totalMinutes * 0.1).toFixed(2);
    return { totalMinutes, heygen, did };
  }, [scenes]);

  const generateAll = useCallback(async () => {
    if (estimate.totalMinutes > 5) {
      if (!confirm(`예상 비용이 $${estimate.heygen} (HeyGen) 입니다. 계속할까요?`)) {
        return;
      }
    }
    for (const scene of scenes) {
      if (!scene.avatarPresetId && !defaultPresetId) {
        alert(`장면 ${scene.sceneIndex + 1}: 아바타가 선택되지 않았습니다.`);
        return;
      }
    }
    for (const scene of scenes) {
      const presetId = scene.avatarPresetId ?? defaultPresetId!;
      await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "generate-avatar-lipsync",
          projectId,
          payload: { sceneId: scene.id, avatarPresetId: presetId },
        }),
      });
    }
  }, [scenes, defaultPresetId, projectId, estimate]);

  return (
    <div className="space-y-6">
      <AvatarCostBanner
        totalMinutes={estimate.totalMinutes}
        heygenUsd={estimate.heygen}
        didUsd={estimate.did}
      />

      <Card>
        <CardHeader>
          <CardTitle>아바타 라이브러리</CardTitle>
        </CardHeader>
        <CardContent>
          <AvatarLibraryGrid
            presets={presets}
            loading={loading}
            selectedId={defaultPresetId}
            onSelect={(id) => setDefaultPresetId(id)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>참조 사진 업로드</CardTitle>
        </CardHeader>
        <CardContent>
          <AvatarReferenceUpload
            onUploadComplete={async () => {
              // Re-fetch presets after upload completes
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>프로젝트 기본 아바타</CardTitle>
        </CardHeader>
        <CardContent>
          <AvatarProjectDefault
            projectId={projectId}
            presets={presets}
            selectedId={defaultPresetId}
            onSelect={setDefaultPresetId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>장면별 아바타 &amp; 레이아웃</CardTitle>
        </CardHeader>
        <CardContent>
          <AvatarSceneList
            projectId={projectId}
            scenes={scenes}
            presets={presets}
            onSceneUpdate={(updated) =>
              setScenes((prev) =>
                prev.map((s) => (s.id === updated.id ? updated : s))
              )
            }
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={generateAll} size="lg">
          모든 장면에 대해 생성하기
        </Button>
      </div>
    </div>
  );
}
