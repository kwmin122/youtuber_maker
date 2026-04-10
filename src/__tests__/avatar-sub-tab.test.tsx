// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AvatarSubTab } from "@/components/project/avatar-sub-tab";
import type { AvatarPreset, Scene } from "@/components/project/avatar-sub-tab";

// ─── helpers ────────────────────────────────────────────────────────────────

const makePreset = (id: string, overrides: Partial<AvatarPreset> = {}): AvatarPreset => ({
  id,
  userId: null,
  provider: "heygen",
  providerAvatarId: `av-${id}`,
  gender: "female",
  ageGroup: "adult",
  style: "realistic",
  previewImageUrl: `https://example.com/${id}.jpg`,
  source: "library",
  ...overrides,
});

const makeScene = (id: string, overrides: Partial<Scene> = {}): Scene => ({
  id,
  sceneIndex: 0,
  duration: 10,
  narration: "test narration",
  sourceType: "manual",
  avatarPresetId: "preset-1",
  avatarLayout: null,
  avatarVideoUrl: null,
  avatarProviderTaskId: null,
  ...overrides,
});

const PRESETS: AvatarPreset[] = [
  makePreset("preset-1"),
  makePreset("preset-2", { gender: "male" }),
];

const SCENES: Scene[] = [
  makeScene("scene-1", { sceneIndex: 0, avatarPresetId: "preset-1" }),
  makeScene("scene-2", { sceneIndex: 1, avatarPresetId: "preset-1" }),
];

// ─── mocks ──────────────────────────────────────────────────────────────────

// Default fetch mock: presets endpoint returns PRESETS, everything else → ok
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === "/api/avatar/presets") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(PRESETS),
      });
    }
    // Jobs endpoint
    if (url === "/api/jobs") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: "job-x" }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── tests ──────────────────────────────────────────────────────────────────

describe("AvatarSubTab", () => {
  it("renders the generate-all button", async () => {
    render(<AvatarSubTab projectId="proj-1" scenes={SCENES} />);
    await waitFor(() => {
      expect(screen.getByText(/모든 장면에 대해 생성하기/)).toBeInTheDocument();
    });
  });

  it("calls /api/jobs once per scene when '모든 장면에 대해 생성하기' is clicked", async () => {
    render(<AvatarSubTab projectId="proj-1" scenes={SCENES} />);

    // Wait for presets to load
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/avatar/presets")
    );

    const btn = screen.getByText(/모든 장면에 대해 생성하기/);
    fireEvent.click(btn);

    // Should post a job for each scene (2 scenes)
    await waitFor(() => {
      const jobCalls = fetchMock.mock.calls.filter(
        (args: unknown[]) => args[0] === "/api/jobs"
      );
      expect(jobCalls).toHaveLength(2);
    });

    // Both calls must use type: "generate-avatar-lipsync"
    const jobCalls = fetchMock.mock.calls.filter(
      (args: unknown[]) => args[0] === "/api/jobs"
    );
    for (const [, options] of jobCalls) {
      const body = JSON.parse((options as RequestInit).body as string);
      expect(body.type).toBe("generate-avatar-lipsync");
      expect(body.projectId).toBe("proj-1");
    }
  });

  it("shows the longform-clip guard modal when interacting with a longform-clip scene", async () => {
    const longformScenes: Scene[] = [
      makeScene("scene-lf", {
        sceneIndex: 0,
        sourceType: "longform-clip",
        avatarPresetId: null, // no preset yet → triggers guard
      }),
    ];

    render(<AvatarSubTab projectId="proj-1" scenes={longformScenes} />);

    // Wait for presets to load
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/avatar/presets")
    );

    // The regenerate button for this scene should be visible
    const regenBtn = screen.getByTestId("regenerate-btn-scene-lf");

    // Button is disabled when no avatarPresetId — let's interact via the preset select
    // which triggers the guard
    const presetSelect = screen.getByTestId("scene-preset-select-scene-lf");
    fireEvent.change(presetSelect, { target: { value: "preset-1" } });

    // Guard modal should appear
    await waitFor(() => {
      expect(screen.getByText(/이미 원본 영상이 있습니다/)).toBeInTheDocument();
    });
  });
});
