import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("@/lib/video/ffmpeg-export", () => ({
  exportVideo: vi.fn(),
}));

vi.mock("@/lib/media/storage", () => ({
  uploadMedia: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
  scenes: { id: "id", scriptId: "scriptId", sceneIndex: "sceneIndex" },
  mediaAssets: { id: "id", sceneId: "sceneId", status: "status" },
  audioTracks: { id: "id", projectId: "projectId" },
  projects: { id: "id" },
  jobs: { id: "id" },
  jobEvents: {},
}));

import { handleExportVideo } from "@/worker/handlers/export-video";
import type { Job } from "bullmq";

function createMockJob(data: Record<string, unknown>): Job {
  return { data } as unknown as Job;
}

function createMockDb(overrides: Record<string, unknown> = {}) {
  const chainable = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "new-id" }]),
    limit: vi.fn().mockResolvedValue([]),
  };

  return {
    update: vi.fn().mockReturnValue(chainable),
    insert: vi.fn().mockReturnValue(chainable),
    select: vi.fn().mockReturnValue(chainable),
    delete: vi.fn().mockReturnValue(chainable),
    ...overrides,
  };
}

describe("handleExportVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws if projectId is missing from payload", async () => {
    const job = createMockJob({
      jobId: "job-1",
      userId: "user-1",
      payload: { scriptId: "script-1" },
    });

    const db = createMockDb();

    await expect(
      handleExportVideo(job, db as never)
    ).rejects.toThrow("projectId and scriptId are required in payload");
  });

  it("throws if scriptId is missing from payload", async () => {
    const job = createMockJob({
      jobId: "job-1",
      userId: "user-1",
      payload: { projectId: "project-1" },
    });

    const db = createMockDb();

    await expect(
      handleExportVideo(job, db as never)
    ).rejects.toThrow("projectId and scriptId are required in payload");
  });

  it("throws if no scenes are found", async () => {
    const job = createMockJob({
      jobId: "job-1",
      userId: "user-1",
      payload: { projectId: "project-1", scriptId: "script-1" },
    });

    // Mock db to return empty scenes array
    const chainable = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "new-id" }]),
    };

    const db = {
      update: vi.fn().mockReturnValue(chainable),
      insert: vi.fn().mockReturnValue(chainable),
      select: vi.fn().mockReturnValue(chainable),
      delete: vi.fn().mockReturnValue(chainable),
    };

    await expect(
      handleExportVideo(job, db as never)
    ).rejects.toThrow("No scenes found for this script");
  });
});
