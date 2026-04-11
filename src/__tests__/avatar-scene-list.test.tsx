// @vitest-environment jsdom
/**
 * Regression test for VERIFICATION.md CRITICAL C2:
 * "Regeneration is a no-op — handleRegenerate POSTs to /api/jobs without
 * first clearing avatarVideoUrl / avatarProviderTaskId, so the worker's
 * idempotency gate always returns skipped: true."
 *
 * These tests mount <AvatarSceneList> in RTL, mock fetch, click
 * the 재생성 button, and assert the PATCH to clear avatar state fires
 * BEFORE the POST to /api/jobs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AvatarSceneList } from "@/components/project/avatar-scene-list";
import type { Scene, AvatarPreset } from "@/components/project/avatar-sub-tab";

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "scene-1",
    sceneIndex: 0,
    narration: "Hello",
    duration: 5,
    avatarPresetId: "preset-1",
    avatarLayout: null,
    avatarVideoUrl: "https://cdn.example.com/existing.mp4",
    avatarProviderTaskId: "task-old",
    sourceType: "manual",
    ...overrides,
  };
}

const PRESETS: AvatarPreset[] = [
  {
    id: "preset-1",
    userId: null,
    provider: "heygen",
    providerAvatarId: "avatar-xyz",
    gender: "female",
    ageGroup: "adult",
    style: "business",
    previewImageUrl: "https://cdn.example.com/preview.jpg",
    source: "library",
  },
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe("AvatarSceneList — regeneration clears avatar state before enqueue (C2 regression)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends PATCH with {avatarVideoUrl:null, avatarProviderTaskId:null} BEFORE POST to /api/jobs", async () => {
    const fetchCalls: { method: string; url: string; body: unknown }[] = [];

    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      fetchCalls.push({ method: init?.method ?? "GET", url, body });
      return { ok: true, status: 200, json: async () => ({ updated: true }) };
    }));

    const scene = makeScene();

    render(
      <AvatarSceneList
        projectId="project-1"
        scenes={[scene]}
        presets={PRESETS}
        onSceneUpdate={vi.fn()}
      />
    );

    const regenBtn = screen.getByTestId("regenerate-btn-scene-1");
    fireEvent.click(regenBtn);

    await waitFor(() => {
      expect(fetchCalls.length).toBeGreaterThanOrEqual(2);
    });

    // First call must be the PATCH to clear avatar state
    const firstCall = fetchCalls[0];
    expect(firstCall.method).toBe("PATCH");
    expect(firstCall.url).toContain("/api/scenes/scene-1/avatar");
    expect(firstCall.body).toEqual({ avatarVideoUrl: null, avatarProviderTaskId: null });

    // Second call must be the POST to enqueue the job
    const secondCall = fetchCalls[1];
    expect(secondCall.method).toBe("POST");
    expect(secondCall.url).toBe("/api/jobs");
    expect(secondCall.body).toMatchObject({
      type: "generate-avatar-lipsync",
      payload: { sceneId: "scene-1" },
    });
  });

  it("does NOT enqueue job if PATCH clear fails (non-ok response)", async () => {
    const fetchCalls: { method: string; url: string }[] = [];

    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ method: init?.method ?? "GET", url });
      // Simulate PATCH returning 403
      return { ok: false, status: 403, json: async () => ({ error: "forbidden" }) };
    }));

    const scene = makeScene();

    render(
      <AvatarSceneList
        projectId="project-1"
        scenes={[scene]}
        presets={PRESETS}
        onSceneUpdate={vi.fn()}
      />
    );

    const regenBtn = screen.getByTestId("regenerate-btn-scene-1");
    fireEvent.click(regenBtn);

    // Wait a bit for any async operations
    await new Promise((r) => setTimeout(r, 50));

    // Only the PATCH should have fired; no POST
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].method).toBe("PATCH");
    expect(fetchCalls[0].url).toContain("/api/scenes/scene-1/avatar");
    expect(fetchCalls.some((c) => c.url === "/api/jobs")).toBe(false);
  });
});
