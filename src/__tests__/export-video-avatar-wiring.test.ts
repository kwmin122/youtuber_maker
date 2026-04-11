/**
 * Regression test for VERIFICATION.md CRITICAL C1:
 * "Export pipeline never forwards avatarVideoUrl / avatarLayout from the DB
 * to ExportScene objects → avatar invisible in final MP4."
 *
 * These tests mock the DB to return scene rows with and without avatar data
 * and assert that the ExportScene objects passed to exportVideo contain the
 * correct avatar fields.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (must precede dynamic imports) ───────────────────────────────────

vi.mock("@/lib/video/ffmpeg-export", () => ({
  exportVideo: vi.fn(),
}));

vi.mock("@/lib/media/storage", () => ({
  uploadMedia: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
  scenes: { id: "id", scriptId: "scriptId", sceneIndex: "sceneIndex" },
  mediaAssets: { id: "id", sceneId: "sceneId", status: "status", type: "type" },
  audioTracks: { id: "id", projectId: "projectId" },
  projects: { id: "id" },
  jobs: { id: "id", status: "status" },
  jobEvents: { jobId: "jobId" },
}));

import { handleExportVideo } from "@/worker/handlers/export-video";
import { exportVideo } from "@/lib/video/ffmpeg-export";
import { uploadMedia } from "@/lib/media/storage";
import type { Job } from "bullmq";
import type { ExportScene } from "@/lib/video/types";

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockJob(data: Record<string, unknown>): Job {
  return { data } as unknown as Job;
}

/**
 * Build a DB mock that returns:
 *   - update/insert chains that resolve cleanly
 *   - select calls driven by the provided result arrays IN ORDER
 *
 * Call sequence in handleExportVideo:
 *   select[0] → sceneRows (resolved via .orderBy())
 *   select[1..N] → mediaAssets per scene (resolved via .where() directly — no .limit())
 *   select[N+1] → audioTracks (resolved via .where() directly)
 *
 * The handler awaits:
 *   - `.from().where().orderBy()` for scenes
 *   - `.from().where(and(...))` for media assets (where is the terminal)
 *   - `.from().where()` for audio tracks (where is the terminal)
 */
function createMockDbWithScenes(
  sceneRows: Record<string, unknown>[],
  mediaAssetsBatch: Record<string, unknown>[][], // one array per scene
  audioTrackRows: Record<string, unknown>[] = []
) {
  // Queue of results for each select() call
  const queue: unknown[][] = [
    sceneRows,
    ...mediaAssetsBatch,
    audioTrackRows,
  ];
  let queueIndex = 0;

  const makeChainableForResult = (result: unknown[]) => {
    const resolveWith = () => Promise.resolve(result);

    // A "thenable chain" object: can be awaited directly (Promise-like)
    // AND still has chainable methods. This handles both:
    //   - select().from(scenes).where(eq).orderBy(asc)  → chain, orderBy resolves
    //   - select().from(assets).where(and(eq, eq))      → thenable, awaited directly
    const c: Record<string, unknown> & { then?: unknown } = {};
    c.set = vi.fn().mockReturnValue(c);
    c.from = vi.fn().mockReturnValue(c);
    // where returns a thenable that also has orderBy
    c.where = vi.fn().mockImplementation(() => {
      // Return an object that is both thenable and has .orderBy
      const thenable: Record<string, unknown> & { then: unknown; catch: unknown } = {
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
        catch: (reject: (e: unknown) => unknown) => Promise.resolve(result).catch(reject),
        orderBy: vi.fn().mockImplementation(resolveWith),
        limit: vi.fn().mockImplementation(resolveWith),
      };
      return thenable;
    });
    // orderBy resolves for scenes call (reached via from().where().orderBy())
    c.orderBy = vi.fn().mockImplementation(resolveWith);
    c.values = vi.fn().mockReturnValue(c);
    c.returning = vi.fn().mockResolvedValue([{ id: "x" }]);
    c.limit = vi.fn().mockImplementation(resolveWith);
    return c;
  };

  // For update/insert, use a simple non-resolving chain (they just fire and forget)
  const mutationChain = () => {
    const c: Record<string, unknown> = {};
    c.set = vi.fn().mockReturnValue(c);
    c.where = vi.fn().mockReturnValue(c);
    c.from = vi.fn().mockReturnValue(c);
    c.orderBy = vi.fn().mockResolvedValue([]);
    c.values = vi.fn().mockReturnValue(c);
    c.returning = vi.fn().mockResolvedValue([{ id: "x" }]);
    c.limit = vi.fn().mockResolvedValue([]);
    return c;
  };

  return {
    update: vi.fn().mockReturnValue(mutationChain()),
    insert: vi.fn().mockReturnValue(mutationChain()),
    select: vi.fn().mockImplementation(() => {
      const result = queue[queueIndex] ?? [];
      queueIndex++;
      return makeChainableForResult(result);
    }),
    delete: vi.fn().mockReturnValue(mutationChain()),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("handleExportVideo — avatar field forwarding (C1 regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards avatarVideoUrl and avatarLayout from DB scene row to ExportScene", async () => {
    const avatarLayout = {
      enabled: true,
      position: "bottom-right" as const,
      scale: 0.35,
      paddingPx: 24,
    };

    const sceneRows = [
      {
        id: "scene-1",
        sceneIndex: 0,
        narration: "Hello world",
        duration: 5,
        scriptId: "script-1",
        subtitleStyle: null,
        transitionType: "cut",
        transitionDuration: 0,
        avatarVideoUrl: "https://cdn.example.com/avatar1.mp4",
        avatarLayout,
      },
    ];

    const mediaAssets = [
      [{ id: "asset-1", sceneId: "scene-1", type: "image", status: "completed", url: "https://cdn.example.com/image1.jpg" }],
    ];

    const db = createMockDbWithScenes(sceneRows, mediaAssets);

    vi.mocked(exportVideo).mockResolvedValue(Buffer.from("fake-mp4"));
    vi.mocked(uploadMedia).mockResolvedValue({
      publicUrl: "https://cdn.example.com/export.mp4",
      storagePath: "exports/export.mp4",
    });

    const job = createMockJob({
      jobId: "job-1",
      userId: "user-1",
      payload: { projectId: "project-1", scriptId: "script-1" },
    });

    await handleExportVideo(job, db as never);

    expect(exportVideo).toHaveBeenCalledOnce();
    const [request] = vi.mocked(exportVideo).mock.calls[0];
    const exportedScene: ExportScene = request.scenes[0];

    expect(exportedScene.avatarVideoUrl).toBe("https://cdn.example.com/avatar1.mp4");
    expect(exportedScene.avatarLayout).toEqual(avatarLayout);
  });

  it("leaves avatarVideoUrl and avatarLayout undefined when the DB scene row has no avatar", async () => {
    const sceneRows = [
      {
        id: "scene-1",
        sceneIndex: 0,
        narration: "No avatar scene",
        duration: 4,
        scriptId: "script-1",
        subtitleStyle: null,
        transitionType: "cut",
        transitionDuration: 0,
        avatarVideoUrl: null,
        avatarLayout: null,
      },
    ];

    const mediaAssets = [
      [{ id: "asset-1", sceneId: "scene-1", type: "image", status: "completed", url: "https://cdn.example.com/image1.jpg" }],
    ];

    const db = createMockDbWithScenes(sceneRows, mediaAssets);

    vi.mocked(exportVideo).mockResolvedValue(Buffer.from("fake-mp4"));
    vi.mocked(uploadMedia).mockResolvedValue({
      publicUrl: "https://cdn.example.com/export.mp4",
      storagePath: "exports/export.mp4",
    });

    const job = createMockJob({
      jobId: "job-1",
      userId: "user-1",
      payload: { projectId: "project-1", scriptId: "script-1" },
    });

    await handleExportVideo(job, db as never);

    expect(exportVideo).toHaveBeenCalledOnce();
    const [request] = vi.mocked(exportVideo).mock.calls[0];
    const exportedScene: ExportScene = request.scenes[0];

    // Should be undefined (not null) so the filter graph can safely check `if (scene.avatarVideoUrl)`
    expect(exportedScene.avatarVideoUrl).toBeUndefined();
    expect(exportedScene.avatarLayout).toBeUndefined();
  });

  it("forwards avatar fields only for scenes that have them (mixed 2-scene project)", async () => {
    const avatarLayout = {
      enabled: true,
      position: "bottom-right" as const,
      scale: 0.35,
      paddingPx: 24,
    };

    const sceneRows = [
      {
        id: "scene-1",
        sceneIndex: 0,
        narration: "Scene with avatar",
        duration: 5,
        scriptId: "script-1",
        subtitleStyle: null,
        transitionType: "cut",
        transitionDuration: 0,
        avatarVideoUrl: "https://cdn.example.com/a1.mp4",
        avatarLayout,
      },
      {
        id: "scene-2",
        sceneIndex: 1,
        narration: "Scene without avatar",
        duration: 4,
        scriptId: "script-1",
        subtitleStyle: null,
        transitionType: "cut",
        transitionDuration: 0,
        avatarVideoUrl: null,
        avatarLayout: null,
      },
    ];

    const mediaAssets = [
      [{ id: "asset-1", sceneId: "scene-1", type: "image", status: "completed", url: "https://cdn.example.com/img1.jpg" }],
      [{ id: "asset-2", sceneId: "scene-2", type: "image", status: "completed", url: "https://cdn.example.com/img2.jpg" }],
    ];

    const db = createMockDbWithScenes(sceneRows, mediaAssets);

    vi.mocked(exportVideo).mockResolvedValue(Buffer.from("fake-mp4"));
    vi.mocked(uploadMedia).mockResolvedValue({
      publicUrl: "https://cdn.example.com/export.mp4",
      storagePath: "exports/export.mp4",
    });

    const job = createMockJob({
      jobId: "job-1",
      userId: "user-1",
      payload: { projectId: "project-1", scriptId: "script-1" },
    });

    await handleExportVideo(job, db as never);

    expect(exportVideo).toHaveBeenCalledOnce();
    const [request] = vi.mocked(exportVideo).mock.calls[0];

    // First scene: avatar present
    expect(request.scenes[0].avatarVideoUrl).toBe("https://cdn.example.com/a1.mp4");
    expect(request.scenes[0].avatarLayout).toEqual(avatarLayout);

    // Second scene: no avatar
    expect(request.scenes[1].avatarVideoUrl).toBeUndefined();
    expect(request.scenes[1].avatarLayout).toBeUndefined();
  });
});
