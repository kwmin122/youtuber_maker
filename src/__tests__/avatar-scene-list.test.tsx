// @vitest-environment jsdom
/**
 * Regression test for VERIFICATION.md CRITICAL C2 (updated after Codex cold review):
 *
 * OLD (fragile) approach:
 *   PATCH /api/scenes/[id]/avatar with {avatarVideoUrl:null} THEN POST /api/jobs
 *   → data-loss race: if POST fails, DB is already cleared
 *
 * NEW (safe) approach:
 *   Single POST /api/jobs with payload.regenerate=true
 *   → if POST fails, DB state is untouched (no data loss)
 *
 * These tests mount <AvatarSceneList> in RTL, mock fetch, click
 * the 재생성 button, and assert the new single-POST behaviour.
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

describe("AvatarSceneList — regeneration uses regenerate:true payload flag (C2 Codex cold review)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a single POST to /api/jobs with regenerate:true — no PATCH to clear avatar state", async () => {
    const fetchCalls: { method: string; url: string; body: unknown }[] = [];

    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      fetchCalls.push({ method: init?.method ?? "GET", url, body });
      return { ok: true, status: 201, json: async () => ({ jobId: "job-new" }) };
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
      expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
    });

    // Must be exactly one fetch call: the POST
    expect(fetchCalls).toHaveLength(1);
    const call = fetchCalls[0];
    expect(call.method).toBe("POST");
    expect(call.url).toBe("/api/jobs");
    expect(call.body).toMatchObject({
      type: "generate-avatar-lipsync",
      payload: {
        sceneId: "scene-1",
        regenerate: true,
      },
    });

    // No PATCH must have fired — DB state is untouched
    const patchCalls = fetchCalls.filter((c) => c.method === "PATCH");
    expect(patchCalls).toHaveLength(0);
  });

  it("does NOT mutate DB state when POST fails — no PATCH calls at all", async () => {
    const fetchCalls: { method: string; url: string }[] = [];

    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ method: init?.method ?? "GET", url });
      // Simulate POST /api/jobs returning 500
      return { ok: false, status: 500, json: async () => ({ error: "internal server error" }) };
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

    // Wait for any async operations to settle
    await new Promise((r) => setTimeout(r, 50));

    // Only the POST fired (and it failed), no PATCH at all
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].method).toBe("POST");
    expect(fetchCalls[0].url).toBe("/api/jobs");

    // Crucially: no PATCH to clear avatar state — DB is untouched
    const patchCalls = fetchCalls.filter((c) => c.method === "PATCH");
    expect(patchCalls).toHaveLength(0);
  });
});
