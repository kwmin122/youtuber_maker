"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface ProviderStatus {
  connected: boolean;
  expiresAt: string | null;
}

interface ConnectedAccountsStatus {
  google: ProviderStatus;
  tiktok: ProviderStatus;
  instagram: ProviderStatus;
  tiktokConfigured: boolean;
  instagramConfigured: boolean;
}

function formatExpiry(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  try {
    return new Date(expiresAt).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return expiresAt;
  }
}

interface PlatformRowProps {
  name: string;
  icon: string;
  status: ProviderStatus | undefined;
  connectHref?: string;
  connectLabel?: string;
  isConfigured?: boolean;
  onDisconnect?: () => Promise<void>;
}

function PlatformRow({
  name,
  icon,
  status,
  connectHref,
  connectLabel,
  isConfigured,
  onDisconnect,
}: PlatformRowProps) {
  const connected = status?.connected ?? false;
  const expiryDate = formatExpiry(status?.expiresAt ?? null);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    if (!onDisconnect) return;
    setDisconnecting(true);
    try {
      await onDisconnect();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">
          {icon}
        </span>
        <div>
          <p className="font-medium">{name}</p>
          {expiryDate && connected && (
            <p className="text-xs text-muted-foreground">만료: {expiryDate}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            connected
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {connected ? "연결됨" : "미연결"}
        </span>
        {connectHref && !connected && (
          <a
            href={connectHref}
            className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground ${
              !isConfigured
                ? "pointer-events-none opacity-50 cursor-not-allowed"
                : ""
            }`}
            aria-disabled={!isConfigured}
            title={!isConfigured ? "앱 심사 준비 중" : undefined}
            tabIndex={!isConfigured ? -1 : undefined}
          >
            {connectLabel}
          </a>
        )}
        {connected && onDisconnect && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
          >
            {disconnecting ? "해제 중..." : "연결 해제"}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ConnectedAccountsPage() {
  const [status, setStatus] = useState<ConnectedAccountsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/auth/connected-accounts");
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.status}`);
      }
      const data: ConnectedAccountsStatus = await res.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  async function handleDisconnect(providerId: "tiktok" | "instagram") {
    const res = await fetch("/api/auth/connected-accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId }),
    });
    if (!res.ok) {
      throw new Error(`Disconnect failed: ${res.status}`);
    }
    await fetchStatus();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">연결된 계정</h1>
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">연결된 계정</h1>
        <p className="text-sm text-red-500">{error}</p>
        <Button variant="outline" onClick={() => void fetchStatus()}>
          다시 시도
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">연결된 계정</h1>
        <p className="text-sm text-muted-foreground mt-1">
          플랫폼 계정을 연결하면 영상을 직접 업로드할 수 있습니다.
        </p>
      </div>

      <div className="space-y-3">
        <PlatformRow
          name="YouTube / Google"
          icon="🎬"
          status={status?.google}
        />
        <PlatformRow
          name="TikTok"
          icon="🎵"
          status={status?.tiktok}
          connectHref="/api/auth/tiktok"
          connectLabel="TikTok 연결"
          isConfigured={status?.tiktokConfigured}
          onDisconnect={() => handleDisconnect("tiktok")}
        />
        <PlatformRow
          name="Instagram Reels"
          icon="📸"
          status={status?.instagram}
          connectHref="/api/auth/instagram"
          connectLabel="Instagram 연결"
          isConfigured={status?.instagramConfigured}
          onDisconnect={() => handleDisconnect("instagram")}
        />
      </div>
    </div>
  );
}
