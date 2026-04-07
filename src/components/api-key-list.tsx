"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface ApiKey {
  id: string;
  provider: string;
  label: string | null;
  last4: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface ApiKeyListProps {
  refreshTrigger: number;
}

export function ApiKeyList({ refreshTrigger }: ApiKeyListProps) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/api-keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data);
      }
    } catch {
      // Silently handle fetch errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys, refreshTrigger]);

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to revoke this API key?")) return;

    setDeleting(id);
    try {
      const res = await fetch("/api/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (res.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
      }
    } catch {
      // Silently handle delete errors
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading keys...</p>;
  }

  if (keys.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No API keys registered yet.
      </p>
    );
  }

  return (
    <div className="rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-2 text-left font-medium">Provider</th>
            <th className="px-4 py-2 text-left font-medium">Label</th>
            <th className="px-4 py-2 text-left font-medium">Key</th>
            <th className="px-4 py-2 text-left font-medium">Created</th>
            <th className="px-4 py-2 text-left font-medium">Last Used</th>
            <th className="px-4 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id} className="border-b">
              <td className="px-4 py-2 font-medium capitalize">
                {key.provider}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {key.label || "-"}
              </td>
              <td className="px-4 py-2 font-mono">
                {"····" + key.last4}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {new Date(key.createdAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {key.lastUsedAt
                  ? new Date(key.lastUsedAt).toLocaleDateString()
                  : "-"}
              </td>
              <td className="px-4 py-2 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(key.id)}
                  disabled={deleting === key.id}
                  className="text-destructive hover:text-destructive"
                >
                  {deleting === key.id ? "Revoking..." : "Revoke"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
