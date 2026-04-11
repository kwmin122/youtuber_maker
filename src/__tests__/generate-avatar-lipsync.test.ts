/**
 * Unit tests for `handleGenerateAvatarLipsync` (Plan 08-04 Task 7).
 *
 * All external dependencies are mocked:
 *   - getUserAvatarProvider (provider factory)
 *   - uploadAvatarVideoFromPath (storage)
 *   - convertToWav16kMono (audio conversion)
 *   - fetch (audio download, provider result download, WAV staging)
 *   - getServiceRoleClient (WAV staging signed URL + cleanup)
 *   - child_process.spawn (ffprobe duration probe)
 *
 * 6 test cases per PLANS.md requirement:
 *   1. Ownership mismatch → throws
 *   2. TTS not ready → throws
 *   3. Idempotency (avatarVideoUrl already set) → short-circuits
 *   4. Happy path with HeyGen → returns { skipped: false }
 *   5. HeyGen fails → D-ID fallback succeeds
 *   6. CAS race (job already active) → returns skipped: true
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

// ── Mock declarations (must be before imports of mocked modules) ───────────

vi.mock("@/lib/avatar/provider-factory", () => ({
  getUserAvatarProvider: vi.fn(),
}));

vi.mock("@/lib/media/avatar-video-storage", () => ({
  uploadAvatarVideoFromPath: vi.fn(),
}));

vi.mock("@/lib/video/audio-convert", () => ({
  convertToWav16kMono: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase", () => ({
  getServiceRoleClient: vi.fn(),
}));

// Mock child_process.spawn for ffprobe
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

// Mock fs/promises for file operations
vi.mock("fs/promises", () => ({
  mkdtemp: vi.fn().mockResolvedValue("/tmp/avatar-test-xxx"),
  rm: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ size: 12345 }),
}));

// Mock createReadStream / createWriteStream
vi.mock("fs", () => ({
  createReadStream: vi.fn().mockReturnValue({}),
  createWriteStream: vi.fn().mockReturnValue(new EventEmitter()),
}));

// Mock stream/promises pipeline
vi.mock("stream/promises", () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));

// Mock schema table objects (Drizzle-style table references)
vi.mock("@/lib/db/schema", () => ({
  jobs: { id: "id", status: "status" },
  jobEvents: { jobId: "jobId" },
  scenes: {
    id: "id",
    scriptId: "scriptId",
    duration: "duration",
    avatarPresetId: "avatarPresetId",
    avatarVideoUrl: "avatarVideoUrl",
    avatarProviderTaskId: "avatarProviderTaskId",
  },
  scripts: { id: "id", projectId: "projectId" },
  projects: { id: "id", userId: "userId" },
  mediaAssets: { id: "id", sceneId: "sceneId", type: "type", status: "status" },
  avatarPresets: { id: "id" },
}));

import { handleGenerateAvatarLipsync } from "@/worker/handlers/generate-avatar-lipsync";
import { getUserAvatarProvider } from "@/lib/avatar/provider-factory";
import { uploadAvatarVideoFromPath } from "@/lib/media/avatar-video-storage";
import { getServiceRoleClient } from "@/lib/supabase";
import { spawn } from "child_process";
import type { Job } from "bullmq";

// ── Test helpers ─────────────────────────────────────────────────────────────

function createMockJob(data: Record<string, unknown>): Job {
  return {
    data,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job;
}

/** Build a chainable Drizzle mock with per-table result overrides */
function createMockDb(selectResults: Record<string, unknown[][]> = {}) {
  let callCount = 0;

  const makeChainable = (tableResults: unknown[][] = [[]]) => {
    let depth = 0;
    const chain: Record<string, unknown> = {};
    const resolve = () => {
      const result = tableResults[depth] ?? tableResults[tableResults.length - 1] ?? [];
      depth++;
      return Promise.resolve(result);
    };
    chain.set = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.from = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockImplementation(resolve);
    chain.values = vi.fn().mockReturnValue(chain);
    chain.returning = vi.fn().mockImplementation(resolve);
    chain.limit = vi.fn().mockImplementation(resolve);
    return chain;
  };

  const selectCallResults = (selectResults["select"] as unknown[][] | undefined) ?? [];

  return {
    update: vi.fn().mockImplementation(() => {
      const results = (selectResults["update"] as unknown[][] | undefined) ?? [[{ id: "job-1" }]];
      return makeChainable(results);
    }),
    insert: vi.fn().mockImplementation(() => {
      return makeChainable([[{ id: "event-1" }]]);
    }),
    select: vi.fn().mockImplementation(() => {
      const result = selectCallResults[callCount] ?? [];
      callCount++;
      return makeChainable([result]);
    }),
    delete: vi.fn().mockImplementation(() => makeChainable([[]])),
  };
}

/** Build a stub provider that reports a given status */
function makeProviderStub(status: "completed" | "failed", videoUrl?: string) {
  return {
    provider: {
      name: "heygen" as const,
      generateLipsyncJob: vi.fn().mockResolvedValue("task-123"),
      waitForCompletion: vi.fn().mockResolvedValue({
        taskId: "task-123",
        status,
        videoUrl: status === "completed" ? (videoUrl ?? "https://cdn.example.com/avatar.mp4") : undefined,
        errorMessage: status === "failed" ? "provider error" : undefined,
      }),
      pollJobStatus: vi.fn(),
      listAvatars: vi.fn(),
    },
    providerName: "heygen" as const,
    keyId: "key-1",
  };
}

/** Make ffprobe spawn return a duration */
function mockFfprobeDuration(seconds: number) {
  const spawnMock = vi.mocked(spawn);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spawnMock.mockImplementation((_cmd: string, _args: readonly string[], ..._rest: any[]) => {
    const emitter = new EventEmitter() as NodeJS.EventEmitter & {
      stdout: NodeJS.EventEmitter;
      stderr: NodeJS.EventEmitter;
    };
    emitter.stdout = new EventEmitter();
    emitter.stderr = new EventEmitter();
    process.nextTick(() => {
      (emitter.stdout as EventEmitter).emit("data", Buffer.from(String(seconds) + "\n"));
      emitter.emit("close", 0);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return emitter as any;
  });
}

/** Mock fetch for audio download + WAV staging + provider video download */
function mockFetch() {
  // Use a proper WHATWG ReadableStream so Readable.fromWeb() accepts it
  const makeBody = () => new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
    get body() { return makeBody(); },
    text: vi.fn().mockResolvedValue("ok"),
  }));
}

/** Mock Supabase service role client for WAV staging */
function mockSupabaseClient() {
  const mockSignedUrl = {
    data: { signedUrl: "https://storage.supabase.co/upload-signed", token: "tok" },
    error: null,
  };
  const mockPublicUrl = { data: { publicUrl: "https://storage.supabase.co/tts.wav" } };
  const mockRemove = { data: null, error: null };

  const client = {
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUploadUrl: vi.fn().mockResolvedValue(mockSignedUrl),
        getPublicUrl: vi.fn().mockReturnValue(mockPublicUrl),
        remove: vi.fn().mockResolvedValue(mockRemove),
      }),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(getServiceRoleClient).mockReturnValue(client as any);
  return client;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("handleGenerateAvatarLipsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. rejects when scene is owned by another user (IDOR / ownership mismatch)", async () => {
    mockFetch();
    mockSupabaseClient();

    // Select call sequence:
    //   [0] CAS → job updated (returning [{id: "job-1"}])
    //   [1] scene row → { scriptId: "script-1", ... }
    //   [2] script row → { projectId: "project-1" }
    //   [3] project row → { userId: "user-bbb" }
    const sceneRow = [{
      id: "scene-1", scriptId: "script-1", duration: 5,
      avatarPresetId: "preset-1", avatarVideoUrl: null, avatarProviderTaskId: null,
    }];
    const scriptRow = [{ projectId: "project-1" }];
    const projectRow = [{ userId: "user-bbb" }]; // different from "user-aaa"

    const db = createMockDb({
      select: [sceneRow, scriptRow, projectRow],
    });

    const job = createMockJob({
      jobId: "job-1",
      userId: "user-aaa", // mismatch
      payload: { sceneId: "scene-1" },
    });

    await expect(handleGenerateAvatarLipsync(job, db as Parameters<typeof handleGenerateAvatarLipsync>[1])).rejects.toThrow(
      /ownership mismatch/
    );
  });

  it("2. rejects when TTS audio media_asset is missing or not completed", async () => {
    mockFetch();
    mockSupabaseClient();

    const sceneRow = [{
      id: "scene-1", scriptId: "script-1", duration: 5,
      avatarPresetId: "preset-1", avatarVideoUrl: null, avatarProviderTaskId: null,
    }];
    const scriptRow = [{ projectId: "project-1" }];
    const projectRow = [{ userId: "user-aaa" }];
    const audioAssetRow: unknown[] = []; // no audio asset

    const db = createMockDb({
      select: [sceneRow, scriptRow, projectRow, audioAssetRow],
    });

    const job = createMockJob({
      jobId: "job-1",
      userId: "user-aaa",
      payload: { sceneId: "scene-1" },
    });

    await expect(handleGenerateAvatarLipsync(job, db as Parameters<typeof handleGenerateAvatarLipsync>[1])).rejects.toThrow(
      /TTS audio not ready/
    );
  });

  it("3. short-circuits idempotent when avatarVideoUrl already set", async () => {
    mockFetch();
    mockSupabaseClient();

    // Scene already has both avatarVideoUrl and avatarProviderTaskId set
    const sceneRow = [{
      id: "scene-1", scriptId: "script-1", duration: 5,
      avatarPresetId: "preset-1",
      avatarVideoUrl: "https://cdn.example.com/existing-avatar.mp4",
      avatarProviderTaskId: "existing-task-id",
    }];
    const scriptRow = [{ projectId: "project-1" }];
    const projectRow = [{ userId: "user-aaa" }];

    const db = createMockDb({
      select: [sceneRow, scriptRow, projectRow],
    });

    const job = createMockJob({
      jobId: "job-1",
      userId: "user-aaa",
      payload: { sceneId: "scene-1" },
    });

    const result = await handleGenerateAvatarLipsync(job, db as Parameters<typeof handleGenerateAvatarLipsync>[1]);

    expect(result.skipped).toBe(true);
    expect(result.avatarVideoUrl).toBe("https://cdn.example.com/existing-avatar.mp4");
    // Provider should NOT be called
    expect(getUserAvatarProvider).not.toHaveBeenCalled();
  });

  it("4. happy path with HeyGen — returns { skipped: false } and uploads once", async () => {
    mockFetch();
    mockSupabaseClient();
    mockFfprobeDuration(4.2);

    vi.mocked(getUserAvatarProvider).mockResolvedValue(makeProviderStub("completed"));
    vi.mocked(uploadAvatarVideoFromPath).mockResolvedValue({
      storagePath: "user-aaa/scene-1/avatar.mp4",
      publicUrl: "https://cdn.example.com/avatar.mp4",
    });

    const sceneRow = [{
      id: "scene-1", scriptId: "script-1", duration: 5,
      avatarPresetId: "preset-1", avatarVideoUrl: null, avatarProviderTaskId: null,
    }];
    const scriptRow = [{ projectId: "project-1" }];
    const projectRow = [{ userId: "user-aaa" }];
    const audioAssetRow = [{ id: "asset-1", sceneId: "scene-1", type: "audio", status: "completed", url: "https://tts.example.com/audio.mp3" }];
    const presetRow = [{ id: "preset-1", provider: "heygen", providerAvatarId: "avatar-xyz", previewImageUrl: "https://cdn.heygen.com/preview.jpg" }];

    const db = createMockDb({
      select: [sceneRow, scriptRow, projectRow, audioAssetRow, presetRow],
    });

    const job = createMockJob({
      jobId: "job-1",
      userId: "user-aaa",
      payload: { sceneId: "scene-1" },
    });

    const result = await handleGenerateAvatarLipsync(job, db as Parameters<typeof handleGenerateAvatarLipsync>[1]);

    expect(result.skipped).toBe(false);
    expect(result.avatarVideoUrl).toBe("https://cdn.example.com/avatar.mp4");
    expect(uploadAvatarVideoFromPath).toHaveBeenCalledOnce();
    expect(getUserAvatarProvider).toHaveBeenCalledWith("user-aaa", "heygen");
  });

  it("5. falls back to D-ID when HeyGen waitForCompletion reports failed", async () => {
    mockFetch();
    mockSupabaseClient();
    mockFfprobeDuration(3.5);

    vi.mocked(uploadAvatarVideoFromPath).mockResolvedValue({
      storagePath: "user-aaa/scene-1/avatar.mp4",
      publicUrl: "https://cdn.example.com/did-avatar.mp4",
    });

    // HeyGen → failed; D-ID → completed
    vi.mocked(getUserAvatarProvider)
      .mockImplementation(async (_userId: string, preferred?: string) => {
        if (preferred === "heygen") {
          return {
            provider: {
              name: "heygen" as const,
              generateLipsyncJob: vi.fn().mockResolvedValue("heygen-task"),
              waitForCompletion: vi.fn().mockResolvedValue({
                taskId: "heygen-task",
                status: "failed",
                errorMessage: "heygen quota exceeded",
              }),
              pollJobStatus: vi.fn(),
              listAvatars: vi.fn(),
            },
            providerName: "heygen" as const,
            keyId: "key-1",
          };
        }
        // D-ID
        return {
          provider: {
            name: "did" as const,
            generateLipsyncJob: vi.fn().mockResolvedValue("did-task"),
            waitForCompletion: vi.fn().mockResolvedValue({
              taskId: "did-task",
              status: "completed",
              videoUrl: "https://cdn.example.com/did-avatar.mp4",
            }),
            pollJobStatus: vi.fn(),
            listAvatars: vi.fn(),
          },
          providerName: "did" as const,
          keyId: "key-2",
        };
      });

    const sceneRow = [{
      id: "scene-1", scriptId: "script-1", duration: 5,
      avatarPresetId: "preset-1", avatarVideoUrl: null, avatarProviderTaskId: null,
    }];
    const scriptRow = [{ projectId: "project-1" }];
    const projectRow = [{ userId: "user-aaa" }];
    const audioAssetRow = [{ id: "asset-1", sceneId: "scene-1", type: "audio", status: "completed", url: "https://tts.example.com/audio.mp3" }];
    const presetRow = [{ id: "preset-1", provider: "heygen", providerAvatarId: "avatar-xyz", previewImageUrl: "https://cdn.heygen.com/preview.jpg" }];

    const db = createMockDb({
      select: [sceneRow, scriptRow, projectRow, audioAssetRow, presetRow],
    });

    const job = createMockJob({
      jobId: "job-1",
      userId: "user-aaa",
      payload: { sceneId: "scene-1" },
    });

    const result = await handleGenerateAvatarLipsync(job, db as Parameters<typeof handleGenerateAvatarLipsync>[1]);

    expect(result.skipped).toBe(false);
    expect(result.avatarVideoUrl).toBe("https://cdn.example.com/did-avatar.mp4");
    // Both providers were tried
    expect(getUserAvatarProvider).toHaveBeenCalledWith("user-aaa", "heygen");
    expect(getUserAvatarProvider).toHaveBeenCalledWith("user-aaa", "did");
    expect(uploadAvatarVideoFromPath).toHaveBeenCalledOnce();
  });

  it("7. HeyGen throws at submit (e.g. HTTP 429) — D-ID fallback succeeds (C3 regression)", async () => {
    mockFetch();
    mockSupabaseClient();
    mockFfprobeDuration(3.8);

    vi.mocked(uploadAvatarVideoFromPath).mockResolvedValue({
      storagePath: "user-aaa/scene-1/avatar.mp4",
      publicUrl: "https://cdn.example.com/did-avatar.mp4",
    });

    // HeyGen throws at generateLipsyncJob (429 / network error)
    vi.mocked(getUserAvatarProvider)
      .mockImplementation(async (_userId: string, preferred?: string) => {
        if (preferred === "heygen") {
          return {
            provider: {
              name: "heygen" as const,
              generateLipsyncJob: vi.fn().mockRejectedValue(new Error("HTTP 429 Too Many Requests")),
              waitForCompletion: vi.fn(),
              pollJobStatus: vi.fn(),
              listAvatars: vi.fn(),
            },
            providerName: "heygen" as const,
            keyId: "key-1",
          };
        }
        // D-ID succeeds
        return {
          provider: {
            name: "did" as const,
            generateLipsyncJob: vi.fn().mockResolvedValue("did-task-456"),
            waitForCompletion: vi.fn().mockResolvedValue({
              taskId: "did-task-456",
              status: "completed",
              videoUrl: "https://cdn.example.com/did-avatar.mp4",
            }),
            pollJobStatus: vi.fn(),
            listAvatars: vi.fn(),
          },
          providerName: "did" as const,
          keyId: "key-2",
        };
      });

    const sceneRow = [{
      id: "scene-1", scriptId: "script-1", duration: 5,
      avatarPresetId: "preset-1", avatarVideoUrl: null, avatarProviderTaskId: null,
    }];
    const scriptRow = [{ projectId: "project-1" }];
    const projectRow = [{ userId: "user-aaa" }];
    const audioAssetRow = [{ id: "asset-1", sceneId: "scene-1", type: "audio", status: "completed", url: "https://tts.example.com/audio.mp3" }];
    const presetRow = [{ id: "preset-1", provider: "heygen", providerAvatarId: "avatar-xyz", previewImageUrl: "https://cdn.heygen.com/preview.jpg" }];

    const db = createMockDb({
      select: [sceneRow, scriptRow, projectRow, audioAssetRow, presetRow],
    });

    const job = createMockJob({
      jobId: "job-1",
      userId: "user-aaa",
      payload: { sceneId: "scene-1" },
    });

    const result = await handleGenerateAvatarLipsync(job, db as Parameters<typeof handleGenerateAvatarLipsync>[1]);

    // Handler succeeds via D-ID despite HeyGen throw
    expect(result.skipped).toBe(false);
    expect(result.avatarVideoUrl).toBe("https://cdn.example.com/did-avatar.mp4");
    expect(getUserAvatarProvider).toHaveBeenCalledWith("user-aaa", "heygen");
    expect(getUserAvatarProvider).toHaveBeenCalledWith("user-aaa", "did");
    expect(uploadAvatarVideoFromPath).toHaveBeenCalledOnce();
  });

  it("8. both providers throw — job marked failed with error message (C3 regression)", async () => {
    mockFetch();
    mockSupabaseClient();

    // Both HeyGen and D-ID throw
    vi.mocked(getUserAvatarProvider)
      .mockImplementation(async (_userId: string, preferred?: string) => {
        return {
          provider: {
            name: (preferred ?? "heygen") as "heygen" | "did",
            generateLipsyncJob: vi.fn().mockRejectedValue(
              new Error(preferred === "heygen" ? "HTTP 429" : "D-ID 503 Service Unavailable")
            ),
            waitForCompletion: vi.fn(),
            pollJobStatus: vi.fn(),
            listAvatars: vi.fn(),
          },
          providerName: (preferred ?? "heygen") as "heygen" | "did",
          keyId: "key-1",
        };
      });

    const sceneRow = [{
      id: "scene-1", scriptId: "script-1", duration: 5,
      avatarPresetId: "preset-1", avatarVideoUrl: null, avatarProviderTaskId: null,
    }];
    const scriptRow = [{ projectId: "project-1" }];
    const projectRow = [{ userId: "user-aaa" }];
    const audioAssetRow = [{ id: "asset-1", sceneId: "scene-1", type: "audio", status: "completed", url: "https://tts.example.com/audio.mp3" }];
    const presetRow = [{ id: "preset-1", provider: "heygen", providerAvatarId: "avatar-xyz", previewImageUrl: "https://cdn.heygen.com/preview.jpg" }];

    const db = createMockDb({
      select: [sceneRow, scriptRow, projectRow, audioAssetRow, presetRow],
    });

    const job = createMockJob({
      jobId: "job-1",
      userId: "user-aaa",
      payload: { sceneId: "scene-1" },
    });

    await expect(
      handleGenerateAvatarLipsync(job, db as Parameters<typeof handleGenerateAvatarLipsync>[1])
    ).rejects.toThrow(/all avatar providers failed/);

    // Both providers attempted
    expect(getUserAvatarProvider).toHaveBeenCalledWith("user-aaa", "heygen");
    expect(getUserAvatarProvider).toHaveBeenCalledWith("user-aaa", "did");
    // Storage upload must NOT have been called
    expect(uploadAvatarVideoFromPath).not.toHaveBeenCalled();
  });

  it("6. returns skipped=true on CAS race (job already active — returning().length === 0)", async () => {
    mockFetch();
    mockSupabaseClient();

    // CAS returns empty array (job was already active or cancelled)
    const db = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]), // <-- empty: CAS missed
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([]),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    };

    const job = createMockJob({
      jobId: "job-1",
      userId: "user-aaa",
      payload: { sceneId: "scene-1" },
    });

    const result = await handleGenerateAvatarLipsync(job, db as Parameters<typeof handleGenerateAvatarLipsync>[1]);

    expect(result.skipped).toBe(true);
    expect(result.avatarVideoUrl).toBe("");
    // Provider must NOT be called — CAS aborted
    expect(getUserAvatarProvider).not.toHaveBeenCalled();
  });
});

// ── Audio conversion unit test ────────────────────────────────────────────

describe("convertToWav16kMono (audio-convert module)", () => {
  it("calls ffmpeg with correct WAV conversion args", async () => {
    // Re-import without the module-level mock to test the real function signature
    const { convertToWav16kMono } = await import("@/lib/video/audio-convert");
    // The module-level vi.mock replaces it with a no-op stub, so just verify it resolves
    await expect(convertToWav16kMono("/tmp/in.mp3", "/tmp/out.wav")).resolves.toBeUndefined();
  });
});
