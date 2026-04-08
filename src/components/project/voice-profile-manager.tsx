"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Mic, Trash2, Upload, Plus, Loader2 } from "lucide-react";

interface VoiceProfile {
  id: string;
  name: string;
  sampleUrl: string;
  sampleDuration: number | null;
  consentRecordedAt: string;
  provider: string;
  createdAt: string;
}

export function VoiceProfileManager() {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch("/api/voice-profiles");
      const data = await res.json();
      setProfiles(data.profiles ?? []);
    } catch (error) {
      console.error("Failed to fetch voice profiles:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !consentChecked || !newName.trim()) return;

    setUploading(true);
    try {
      // Read file as base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );

      // Get audio duration
      const audio = new Audio(URL.createObjectURL(file));
      const duration = await new Promise<number>((resolve) => {
        audio.addEventListener("loadedmetadata", () => {
          resolve(audio.duration);
        });
      });

      if (duration < 3 || duration > 20) {
        alert("음성 샘플은 3초~20초 사이여야 합니다.");
        return;
      }

      const res = await fetch("/api/voice-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          sampleBase64: base64,
          sampleContentType: file.type || "audio/wav",
          sampleDuration: duration,
          consentRecordedAt: new Date().toISOString(),
          provider: "openai-tts",
        }),
      });

      if (res.ok) {
        setShowCreateForm(false);
        setNewName("");
        setConsentChecked(false);
        fetchProfiles();
      }
    } catch (error) {
      console.error("Failed to create voice profile:", error);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (profileId: string) => {
    try {
      await fetch(`/api/voice-profiles/${profileId}`, {
        method: "DELETE",
      });
      fetchProfiles();
    } catch (error) {
      console.error("Failed to delete voice profile:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">보이스 프로필</h4>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreateForm(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          새 프로필
        </Button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Input
              placeholder="프로필 이름 (예: 내 목소리)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />

            {/* Consent checkbox -- REQUIRED */}
            <div className="flex items-start space-x-2">
              <Checkbox
                id="voice-consent"
                checked={consentChecked}
                onCheckedChange={(checked) => setConsentChecked(checked === true)}
              />
              <label
                htmlFor="voice-consent"
                className="text-xs leading-tight text-muted-foreground cursor-pointer"
              >
                이 음성 샘플의 소유자임을 확인하며, 음성 합성 목적으로
                사용하는 것에 동의합니다. 언제든지 프로필을 삭제하여
                음성 데이터를 제거할 수 있습니다.
              </label>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!consentChecked || !newName.trim() || uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3 mr-1" />
                )}
                음성 샘플 업로드 (3-20초)
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowCreateForm(false);
                  setConsentChecked(false);
                }}
              >
                취소
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFileUpload}
            />

            <p className="text-xs text-muted-foreground">
              WAV, MP3 형식 지원. 3~20초 길이의 명확한 음성 녹음을 권장합니다.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Profile List */}
      {profiles.length === 0 && !showCreateForm ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          등록된 보이스 프로필이 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {profiles.map((profile) => (
            <Card key={profile.id}>
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{profile.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {profile.provider}
                      </Badge>
                      {profile.sampleDuration && (
                        <span className="text-xs text-muted-foreground">
                          {profile.sampleDuration.toFixed(1)}초
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <audio
                    src={profile.sampleUrl}
                    controls
                    className="h-8 w-32"
                  />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          보이스 프로필 삭제
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          &ldquo;{profile.name}&rdquo; 프로필과 음성 샘플 데이터를
                          완전히 삭제합니다. 이 작업은 되돌릴 수 없습니다.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(profile.id)}
                          className="bg-destructive text-destructive-foreground"
                        >
                          삭제
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
