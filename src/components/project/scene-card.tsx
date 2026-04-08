"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MediaPreview } from "./media-preview";
import {
  RefreshCw,
  Image as ImageIcon,
  Video,
  Volume2,
  Edit2,
  Check,
  X,
} from "lucide-react";

interface Scene {
  id: string;
  sceneIndex: number;
  narration: string;
  imagePrompt: string;
  videoPrompt: string;
  duration: number | null;
}

interface MediaAsset {
  id: string;
  type: "image" | "video" | "audio";
  url: string;
  status: string;
  provider: string;
}

interface SceneCardProps {
  scene: Scene;
  assets: MediaAsset[];
  onRegenerate: (sceneId: string, type: "image" | "video" | "audio") => void;
  onUpdateScene: (sceneId: string, updates: Partial<Scene>) => void;
  isRegenerating?: boolean;
}

export function SceneCard({
  scene,
  assets,
  onRegenerate,
  onUpdateScene,
  isRegenerating,
}: SceneCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editNarration, setEditNarration] = useState(scene.narration);
  const [editImagePrompt, setEditImagePrompt] = useState(scene.imagePrompt);

  const imageAsset = assets.find((a) => a.type === "image");
  const videoAsset = assets.find((a) => a.type === "video");
  const audioAsset = assets.find((a) => a.type === "audio");

  const handleSave = () => {
    onUpdateScene(scene.id, {
      narration: editNarration,
      imagePrompt: editImagePrompt,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditNarration(scene.narration);
    setEditImagePrompt(scene.imagePrompt);
    setIsEditing(false);
  };

  return (
    <Card className="relative">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            장면 {scene.sceneIndex + 1}
            {scene.duration && (
              <Badge variant="outline" className="ml-2">
                {scene.duration}초
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (isEditing ? handleCancel() : setIsEditing(true))}
          >
            {isEditing ? <X className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Narration */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            나레이션
          </label>
          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editNarration}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditNarration(e.target.value)}
                rows={3}
                className="text-sm"
              />
            </div>
          ) : (
            <p className="text-sm">{scene.narration}</p>
          )}
        </div>

        {/* Image Prompt (editable) */}
        {isEditing && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              이미지 프롬프트
            </label>
            <Textarea
              value={editImagePrompt}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditImagePrompt(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>
        )}

        {/* Save/Cancel for edit mode */}
        {isEditing && (
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave}>
              <Check className="h-3 w-3 mr-1" />
              저장
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancel}>
              취소
            </Button>
          </div>
        )}

        {/* Media Previews */}
        <div className="grid grid-cols-3 gap-2">
          {/* Image */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ImageIcon className="h-3 w-3" /> 이미지
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => onRegenerate(scene.id, "image")}
                disabled={isRegenerating}
              >
                <RefreshCw className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <MediaPreview asset={imageAsset} type="image" />
          </div>

          {/* Video */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Video className="h-3 w-3" /> 영상
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => onRegenerate(scene.id, "video")}
                disabled={isRegenerating}
              >
                <RefreshCw className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <MediaPreview asset={videoAsset} type="video" />
          </div>

          {/* Audio */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Volume2 className="h-3 w-3" /> 음성
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => onRegenerate(scene.id, "audio")}
                disabled={isRegenerating}
              >
                <RefreshCw className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <MediaPreview asset={audioAsset} type="audio" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
