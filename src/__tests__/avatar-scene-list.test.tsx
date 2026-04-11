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
 *
 * Codex Retry-3 UX fix: also tests polling-hook-driven button state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AvatarSceneList } from "@/components/project/avatar-scene-list";
import type { Scene, AvatarPreset } from "@/components/project/avatar-sub-tab";

// Mock the polling hook so tests control server job state without real fetches.
// Must be declared before importing the component (vi.mock is hoisted).
const mockProgressMap = vi.hoisted(() => ({ value: {} as Record<string, { status: string; progress: number }> }));
vi.mock("@/hooks/use-scene-avatar-jobs", () => ({
  useSceneAvatarJobs: () => ({ progressMap: mockProgressMap.value }),
}));

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
    mockProgressMap.value = {};
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

describe("AvatarSceneList — polling-hook-driven button state (Codex Retry-3 UX fix)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockProgressMap.value = {};
  });

  it("button is disabled when polling hook reports server job as pending", () => {
    // Server has an active pending job for scene-1
    mockProgressMap.value = { "scene-1": { status: "pending", progress: 10 } };

    vi.stubGlobal("fetch", vi.fn());

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
    expect(regenBtn).toBeDisabled();
  });

  it("button is disabled when polling hook reports server job as active", () => {
    mockProgressMap.value = { "scene-1": { status: "active", progress: 50 } };

    vi.stubGlobal("fetch", vi.fn());

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
    expect(regenBtn).toBeDisabled();
  });

  it("button is enabled when polling hook reports server job as completed", () => {
    // Job completed — no longer in-flight
    mockProgressMap.value = { "scene-1": { status: "completed", progress: 100 } };

    vi.stubGlobal("fetch", vi.fn());

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
    expect(regenBtn).not.toBeDisabled();
  });

  it("button re-enables after 409 POST — local regeneratingIds cleared in finally", async () => {
    // Server returns 409 (job already running from another source), but polling
    // hook shows no in-flight job for this scene (simulating it just completed).
    mockProgressMap.value = {};

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "already_enqueued" }),
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

    // After async POST settles, button should re-enable (finally cleared local guard)
    await waitFor(() => {
      expect(regenBtn).not.toBeDisabled();
    });
  });
});
