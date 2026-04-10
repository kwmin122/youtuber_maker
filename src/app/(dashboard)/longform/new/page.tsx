"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UploadProgress } from "@/components/longform/upload-progress";
import { parseVideoUrl } from "@/lib/youtube/parse-url";
import {
  LONGFORM_ALLOWED_MIME_TYPES,
  LONGFORM_BUCKET,
  LONGFORM_MAX_FILE_BYTES,
} from "@/lib/video/longform-constants";

type UploadState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "uploading"; progress: number }
  | { phase: "creating" }
  | { phase: "error"; message: string };

export default function LongformNewPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlSubmitting, setUrlSubmitting] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ phase: "idle" });

  async function submitUrl() {
    setUrlError(null);
    const parsed = parseVideoUrl(url.trim());
    if (!parsed) {
      setUrlError("유효한 YouTube 영상 URL이 아닙니다.");
      return;
    }
    setUrlSubmitting(true);
    try {
      const res = await fetch("/api/longform/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sourceType: "url", url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "요청에 실패했습니다.");
      }
      toast.success("다운로드를 시작합니다.");
      router.push(`/longform/${data.sourceId}`);
    } catch (err) {
      const msg = (err as Error).message;
      setUrlError(msg);
      toast.error(msg);
    } finally {
      setUrlSubmitting(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setUploadState({ phase: "idle" });
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > LONGFORM_MAX_FILE_BYTES) {
      setUploadState({
        phase: "error",
        message: `파일이 너무 큽니다 (최대 ${Math.round(
          LONGFORM_MAX_FILE_BYTES / (1024 * 1024 * 1024)
        )}GB)`,
      });
      setFile(null);
      return;
    }
    const allowed = LONGFORM_ALLOWED_MIME_TYPES as readonly string[];
    if (!allowed.includes(f.type)) {
      setUploadState({
        phase: "error",
        message: `지원하지 않는 형식입니다 (${f.type || "unknown"}). mp4/mov/webm/mkv만 업로드 가능합니다.`,
      });
      setFile(null);
      return;
    }
    setFile(f);
  }

  async function submitFile() {
    if (!file) return;
    setUploadState({ phase: "signing" });
    try {
      const signedRes = await fetch("/api/longform/sources/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          fileSize: file.size,
        }),
      });
      const signed = await signedRes.json();
      if (!signedRes.ok) {
        throw new Error(signed.error ?? "업로드 URL 발급 실패");
      }

      setUploadState({ phase: "uploading", progress: 0 });

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { error: uploadError } = await supabase.storage
        .from(LONGFORM_BUCKET)
        .uploadToSignedUrl(signed.storagePath, signed.token, file, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }
      setUploadState({ phase: "uploading", progress: 100 });

      setUploadState({ phase: "creating" });
      const createRes = await fetch("/api/longform/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sourceType: "file",
          storagePath: signed.storagePath,
          title: file.name,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        throw new Error(created.error ?? "소스 등록 실패");
      }
      toast.success("업로드가 완료되었습니다. 분석을 시작합니다.");
      router.push(`/longform/${created.sourceId}`);
    } catch (err) {
      const msg = (err as Error).message;
      setUploadState({ phase: "error", message: msg });
      toast.error(msg);
    }
  }

  function retryUpload() {
    setUploadState({ phase: "idle" });
  }

  const isUploading =
    uploadState.phase === "signing" ||
    uploadState.phase === "uploading" ||
    uploadState.phase === "creating";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">새 롱폼 → 쇼츠</h1>
        <p className="text-sm text-muted-foreground">
          YouTube URL을 붙여넣거나 파일을 업로드해 쇼츠 클립 후보를 찾으세요.
        </p>
      </div>
      <Tabs defaultValue="url">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="url">YouTube URL</TabsTrigger>
          <TabsTrigger value="file">파일 업로드</TabsTrigger>
        </TabsList>

        <TabsContent value="url" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="longform-url">YouTube 영상 URL</Label>
            <Input
              id="longform-url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlError(null);
              }}
            />
            {urlError && <p className="text-sm text-red-500">{urlError}</p>}
          </div>
          <Button
            onClick={submitUrl}
            disabled={!url.trim() || urlSubmitting}
          >
            {urlSubmitting ? "요청 중..." : "다운로드 시작"}
          </Button>
        </TabsContent>

        <TabsContent value="file" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="longform-file">영상 파일</Label>
            <Input
              id="longform-file"
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
              onChange={onFileChange}
              disabled={isUploading}
            />
            <p className="text-xs text-muted-foreground">
              mp4, mov, webm, mkv · 최대 2GB
            </p>
          </div>
          {file && (
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium truncate">{file.name}</div>
              <div className="text-xs text-muted-foreground">
                {(file.size / (1024 * 1024)).toFixed(1)} MB
              </div>
            </div>
          )}
          <UploadProgress state={uploadState} onRetry={retryUpload} />
          <Button
            onClick={submitFile}
            disabled={!file || isUploading}
          >
            {isUploading ? "업로드 중..." : "업로드 시작"}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
