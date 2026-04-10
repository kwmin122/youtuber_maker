"use client";

import { useState } from "react";
import type { AvatarPreset } from "./avatar-sub-tab";

interface Props {
  projectId: string;
  presets: AvatarPreset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function AvatarProjectDefault({ projectId, presets, selectedId, onSelect }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(id: string | null) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/default-avatar`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ defaultAvatarPresetId: id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as Record<string, string>).error ?? `${res.status}`);
      }
      onSelect(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2" data-testid="avatar-project-default">
      <label className="text-sm font-medium">프로젝트 기본 아바타</label>
      <select
        data-testid="avatar-project-default-select"
        className="w-full rounded border p-2 text-sm"
        value={selectedId ?? ""}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value || null)}
      >
        <option value="">선택 안함</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            [{p.provider}] {p.gender} · {p.ageGroup} · {p.style}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-xs text-destructive" data-testid="avatar-project-default-error">
          {error}
        </p>
      )}
    </div>
  );
}
