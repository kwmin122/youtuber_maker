"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { AvatarConsentModal } from "./avatar-consent-modal";

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface Props {
  onUploadComplete?: (assetId: string) => void;
}

export function AvatarReferenceUpload({ onUploadComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    if (!f) return;
    if (!ALLOWED.includes(f.type)) {
      setError("지원하지 않는 파일 형식입니다. (JPG/PNG/WebP만 가능)");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("파일 크기가 20 MB를 초과합니다.");
      return;
    }
    setFile(f);
    setConsentOpen(true);
  }

  async function performUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const ext =
        file.type === "image/jpeg"
          ? "jpg"
          : file.type === "image/png"
          ? "png"
          : "webp";

      // 1. Get signed upload URL
      const urlRes = await fetch("/api/avatar/assets/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ext }),
      });
      if (!urlRes.ok) throw new Error(`upload-url failed: ${urlRes.status}`);
      const { signedUrl, storagePath } = (await urlRes.json()) as {
        signedUrl: string;
        storagePath: string;
      };

      // 2. Compute SHA-256 hash
      const bytes = await file.arrayBuffer();
      const imageHash = await sha256Hex(bytes);

      // 3. PUT to signed URL
      const putRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "content-type": file.type, "x-upsert": "true" },
        body: bytes,
      });
      if (!putRes.ok) throw new Error(`PUT failed: ${putRes.status}`);

      // 4. Register in DB
      const createRes = await fetch("/api/avatar/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storagePath, imageHash, consent: true }),
      });
      if (!createRes.ok) {
        const errBody = await createRes.json().catch(() => ({}));
        throw new Error(
          `asset create failed: ${(errBody as Record<string, string>).error ?? createRes.status}`
        );
      }
      const { id } = (await createRes.json()) as { id: string };
      onUploadComplete?.(id);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED.join(",")}
        onChange={onPick}
        data-testid="avatar-file-input"
        className="block text-sm"
      />
      {file && (
        <p className="text-sm text-muted-foreground">
          선택됨: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" data-testid="avatar-upload-error">
          {error}
        </p>
      )}
      {uploading && (
        <p className="text-sm text-muted-foreground">업로드 중...</p>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        type="button"
      >
        참조 사진 선택
      </Button>
      <AvatarConsentModal
        open={consentOpen}
        onOpenChange={setConsentOpen}
        onConfirm={performUpload}
      />
    </div>
  );
}
