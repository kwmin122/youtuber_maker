"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AvatarLayoutPicker, type AvatarLayoutValue } from "./avatar-layout-picker";
import type { AvatarPreset, Scene } from "./avatar-sub-tab";

interface Props {
  projectId: string;
  scenes: Scene[];
  presets: AvatarPreset[];
  onSceneUpdate: (updated: Scene) => void;
}

const DEFAULT_LAYOUT: AvatarLayoutValue = {
  enabled: true,
  position: "bottom-right",
  scale: 0.3,
  paddingPx: 16,
};

export function AvatarSceneList({ projectId, scenes, presets, onSceneUpdate }: Props) {
  const [guardSceneId, setGuardSceneId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  function withLongformGuard(scene: Scene, action: () => void) {
    if (scene.sourceType === "longform-clip" && !scene.avatarPresetId) {
      setGuardSceneId(scene.id);
      setPendingAction(() => action);
    } else {
      action();
    }
  }

  async function patchScene(
    sceneId: string,
    update: Partial<{ avatarPresetId: string | null; avatarLayout: AvatarLayoutValue | null }>
  ) {
    await fetch(`/api/scenes/${sceneId}/avatar`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(update),
    });
  }

  async function handlePresetChange(scene: Scene, presetId: string | null) {
    const updated: Scene = { ...scene, avatarPresetId: presetId };
    onSceneUpdate(updated);
    await patchScene(scene.id, { avatarPresetId: presetId });
  }

  async function handleLayoutChange(scene: Scene, layout: AvatarLayoutValue) {
    const updated: Scene = { ...scene, avatarLayout: layout };
    onSceneUpdate(updated);
    await patchScene(scene.id, { avatarLayout: layout });
  }

  async function handleRegenerate(scene: Scene, projectId: string) {
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "generate-avatar-lipsync",
        projectId,
        payload: { sceneId: scene.id, avatarPresetId: scene.avatarPresetId },
      }),
    });
  }

  return (
    <div className="space-y-4" data-testid="avatar-scene-list">
      {scenes.map((scene) => {
        const layout: AvatarLayoutValue = scene.avatarLayout ?? DEFAULT_LAYOUT;

        return (
          <div
            key={scene.id}
            data-testid={`avatar-scene-row-${scene.id}`}
            className="rounded border p-3 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                장면 {scene.sceneIndex + 1}
                {scene.sourceType === "longform-clip" && (
                  <span className="ml-2 text-xs text-muted-foreground">[롱폼 클립]</span>
                )}
              </span>
              <Button
                size="sm"
                variant="outline"
                data-testid={`regenerate-btn-${scene.id}`}
                disabled={!scene.avatarPresetId}
                onClick={() =>
                  withLongformGuard(scene, () => handleRegenerate(scene, projectId))
                }
              >
                재생성
              </Button>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">아바타 선택</label>
              <select
                data-testid={`scene-preset-select-${scene.id}`}
                className="w-full rounded border p-1.5 text-sm"
                value={scene.avatarPresetId ?? ""}
                onChange={(e) =>
                  withLongformGuard(scene, () =>
                    handlePresetChange(scene, e.target.value || null)
                  )
                }
              >
                <option value="">기본값 사용</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.provider}] {p.gender} · {p.ageGroup} · {p.style}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">레이아웃</label>
              <AvatarLayoutPicker
                value={layout}
                onChange={(v) =>
                  withLongformGuard(scene, () => handleLayoutChange(scene, v))
                }
              />
            </div>

            {scene.avatarVideoUrl && (
              <p className="text-xs text-green-600" data-testid={`avatar-status-${scene.id}`}>
                아바타 영상 준비됨
              </p>
            )}
          </div>
        );
      })}

      {/* Longform-clip guard modal */}
      <Dialog
        open={guardSceneId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setGuardSceneId(null);
            setPendingAction(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>원본 영상 감지됨</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            이미 원본 영상이 있습니다. 아바타를 올리시겠습니까?
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setGuardSceneId(null);
                setPendingAction(null);
              }}
            >
              취소
            </Button>
            <Button
              onClick={() => {
                pendingAction?.();
                setGuardSceneId(null);
                setPendingAction(null);
              }}
            >
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
