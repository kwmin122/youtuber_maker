import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (must be declared before importing the handler) ---

vi.mock("@/lib/video/clip-longform", () => ({
  clipLongform9x16: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/video/disk-preflight", () => ({
  assertDiskSpaceAvailable: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/media/longform-storage", () => ({
  downloadLongformSourceToPath: vi.fn().mockResolvedValue(undefined),
  uploadLongformClipFromPath: vi.fn(),
}));

vi.mock("@/lib/longform/create-child-project", () => ({
  createChildProjectForClip: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
  jobs: { id: "id" },
  jobEvents: {},
  longformSources: { id: "id", userId: "userId" },
  longformCandidates: { id: "id", sourceId: "sourceId" },
}));

vi.mock("fs/promises", async () => {
  return {
    mkdtemp: vi.fn().mockResolvedValue("/tmp/longform-clip-xyz"),
    rm: vi.fn().mockResolvedValue(undefined),
  };
});

import type { Job } from "bullmq";
import { handleLongformClip } from "@/worker/handlers/longform-clip";
import { clipLongform9x16 } from "@/lib/video/clip-longform";
import { assertDiskSpaceAvailable } from "@/lib/video/disk-preflight";
import {
  downloadLongformSourceToPath,
  uploadLongformClipFromPath,
} from "@/lib/media/longform-storage";
import { createChildProjectForClip } from "@/lib/longform/create-child-project";
import { rm, mkdtemp } from "fs/promises";

/** Drizzle-shaped chainable mock supporting select/update/insert. */
function createMockDb(options: {
  sourceRow?: Record<string, unknown> | null;
  candidateRows?: Array<Record<string, unknown>>;
  /**
   * Per-candidate pre-flight rows for the idempotency check.
   * Each entry corresponds to the candidate at the same index.
   * Default: `[{ childProjectId: null }]` for all candidates
   * (no existing project → proceed with clip + upload).
   */
  preflightRows?: Array<Record<string, unknown> | null>;
}) {
  const { sourceRow = null, candidateRows = [], preflightRows } = options;

  let selectCallCount = 0;
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation(() => {
      selectCallCount += 1;
      // Call 1: load source row
      if (selectCallCount === 1) {
        return Promise.resolve(sourceRow ? [sourceRow] : []);
      }
      // Call 2: load candidates batch
      if (selectCallCount === 2) {
        return Promise.resolve(candidateRows);
      }
      // Calls 3+: per-candidate pre-flight idempotency check.
      // Index into preflightRows using (selectCallCount - 3).
      const preflightIdx = selectCallCount - 3;
      const overrides = preflightRows?.[preflightIdx];
      if (overrides === null) {
        return Promise.resolve([]);
      }
      const baseCand = candidateRows[preflightIdx];
      const row = baseCand
        ? { ...baseCand, childProjectId: null, ...(overrides ?? {}) }
        : null;
      return Promise.resolve(row ? [row] : []);
    }),
  };

  const insertValues: Array<Record<string, unknown>> = [];
  const insertChain = {
    values: vi.fn().mockImplementation(function (
      this: unknown,
      v: Record<string, unknown>
    ) {
      insertValues.push(v);
      return Promise.resolve();
    }),
  };

  const updateSets: Array<Record<string, unknown>> = [];
  // `.where()` must return a builder object (not a Promise) so that
  // `.returning()` can be called for the CAS transition. The builder
  // also implements `.then()` so it is directly `await`-able for
  // non-CAS update calls. Default `.returning()` resolves to
  // `[{ id: "source-1" }]` — 1 row updated → CAS passes.
  // Phase 7 retry 3, Codex HIGH-1 fix.
  const makeWhereResult = () => ({
    returning: vi.fn().mockResolvedValue([{ id: "source-1" }]),
    then: (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown
    ) => Promise.resolve(undefined).then(resolve, reject),
  });
  const updateChain = {
    set: vi.fn().mockImplementation(function (
      this: unknown,
      v: Record<string, unknown>
    ) {
      updateSets.push(v);
      return updateChain;
    }),
    where: vi.fn().mockReturnValue(makeWhereResult()),
  };

  const db = {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    delete: vi.fn(),
  };

  return { db, insertValues, updateSets };
}

function makeJob(payload: Record<string, unknown>): Job {
  return {
    data: {
      jobId: "job-1",
      userId: "user-1",
      payload,
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job;
}

const sourceRow = {
  id: "source-1",
  userId: "user-1",
  status: "ready",
  storagePath: "user-1/source-1/source.mp4",
  title: "Source title",
  durationSeconds: 600,
};

const makeCandidate = (id: string, startMs: number, endMs: number) => ({
  id,
  sourceId: "source-1",
  startMs,
  endMs,
  reason: "r",
  titleSuggestion: `T-${id}`,
  transcriptSnippet: "hello",
});

describe("handleLongformClip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(uploadLongformClipFromPath).mockResolvedValue({
      storagePath: "user-1/longform-clips/cand.mp4",
      publicUrl: "https://cdn/clip.mp4",
    });
    vi.mocked(createChildProjectForClip).mockImplementation(
      async ({ candidate }) => ({
        projectId: `proj-${candidate.id}`,
        scriptId: `script-${candidate.id}`,
        sceneId: `scene-${candidate.id}`,
      })
    );
  });

  it("rejects missing sourceId", async () => {
    const { db } = createMockDb({});
    await expect(
      handleLongformClip(makeJob({ candidateIds: ["c1"] }), db as never)
    ).rejects.toThrow(/sourceId is required/);
  });

  it("rejects empty candidateIds", async () => {
    const { db } = createMockDb({});
    await expect(
      handleLongformClip(
        makeJob({ sourceId: "source-1", candidateIds: [] }),
        db as never
      )
    ).rejects.toThrow(/candidateIds must be a non-empty array/);
  });

  it("throws when the source is not found", async () => {
    const { db } = createMockDb({ sourceRow: null });
    await expect(
      handleLongformClip(
        makeJob({ sourceId: "source-1", candidateIds: ["c1"] }),
        db as never
      )
    ).rejects.toThrow(/not found/);
  });

  it("throws when the source status is not ready/analyzed", async () => {
    const { db } = createMockDb({
      sourceRow: { ...sourceRow, status: "downloading" },
    });
    await expect(
      handleLongformClip(
        makeJob({ sourceId: "source-1", candidateIds: ["c1"] }),
        db as never
      )
    ).rejects.toThrow(/not ready for clipping/);
  });

  it("throws when source belongs to a different user", async () => {
    const { db } = createMockDb({
      sourceRow: { ...sourceRow, userId: "someone-else" },
    });
    await expect(
      handleLongformClip(
        makeJob({ sourceId: "source-1", candidateIds: ["c1"] }),
        db as never
      )
    ).rejects.toThrow(/does not belong to user/);
  });

  it("throws when a candidate id in the payload doesn't exist", async () => {
    const { db } = createMockDb({
      sourceRow,
      candidateRows: [makeCandidate("c1", 0, 5000)], // only 1 returned
    });
    await expect(
      handleLongformClip(
        makeJob({ sourceId: "source-1", candidateIds: ["c1", "c2"] }),
        db as never
      )
    ).rejects.toThrow(/expected 2 candidates, found 1/);
  });

  it("downloads source ONCE and clips N times for N candidates", async () => {
    const { db } = createMockDb({
      sourceRow,
      candidateRows: [
        makeCandidate("c1", 0, 5000),
        makeCandidate("c2", 10_000, 15_000),
        makeCandidate("c3", 20_000, 25_000),
      ],
    });

    const result = await handleLongformClip(
      makeJob({
        sourceId: "source-1",
        candidateIds: ["c1", "c2", "c3"],
      }),
      db as never
    );

    // Source downloaded exactly once (streamed to disk).
    expect(downloadLongformSourceToPath).toHaveBeenCalledTimes(1);
    expect(downloadLongformSourceToPath).toHaveBeenCalledWith(
      expect.objectContaining({
        storagePath: "user-1/source-1/source.mp4",
      })
    );
    // FFmpeg invoked once per candidate.
    expect(clipLongform9x16).toHaveBeenCalledTimes(3);
    // Upload + child project called once per candidate.
    expect(uploadLongformClipFromPath).toHaveBeenCalledTimes(3);
    expect(createChildProjectForClip).toHaveBeenCalledTimes(3);
    // Result shape.
    expect(result.count).toBe(3);
    expect(result.childProjectIds).toEqual([
      "proj-c1",
      "proj-c2",
      "proj-c3",
    ]);
  });

  it("runs disk preflight before downloading", async () => {
    const { db } = createMockDb({
      sourceRow,
      candidateRows: [makeCandidate("c1", 0, 5000)],
    });
    await handleLongformClip(
      makeJob({ sourceId: "source-1", candidateIds: ["c1"] }),
      db as never
    );
    // preflight is called after load but before download
    expect(assertDiskSpaceAvailable).toHaveBeenCalled();
    const preflightOrder = vi.mocked(assertDiskSpaceAvailable).mock
      .invocationCallOrder[0];
    const downloadOrder = vi.mocked(downloadLongformSourceToPath).mock
      .invocationCallOrder[0];
    expect(preflightOrder).toBeLessThan(downloadOrder);
  });

  it("cleans up the tempDir in the finally block on SUCCESS", async () => {
    const { db } = createMockDb({
      sourceRow,
      candidateRows: [makeCandidate("c1", 0, 5000)],
    });
    await handleLongformClip(
      makeJob({ sourceId: "source-1", candidateIds: ["c1"] }),
      db as never
    );
    // rm called at least once for the tempDir with recursive:true
    const rmCalls = vi.mocked(rm).mock.calls;
    const recursiveCall = rmCalls.find(
      (call) =>
        typeof call[1] === "object" &&
        call[1] !== null &&
        (call[1] as Record<string, unknown>).recursive === true
    );
    expect(recursiveCall).toBeDefined();
    expect(recursiveCall![0]).toBe("/tmp/longform-clip-xyz");
  });

  it("cleans up the tempDir in the finally block on FAILURE", async () => {
    vi.mocked(clipLongform9x16).mockRejectedValueOnce(
      new Error("ffmpeg exploded")
    );
    const { db } = createMockDb({
      sourceRow,
      candidateRows: [makeCandidate("c1", 0, 5000)],
    });
    await expect(
      handleLongformClip(
        makeJob({ sourceId: "source-1", candidateIds: ["c1"] }),
        db as never
      )
    ).rejects.toThrow(/ffmpeg exploded/);

    const recursiveCall = vi
      .mocked(rm)
      .mock.calls.find(
        (call) =>
          typeof call[1] === "object" &&
          call[1] !== null &&
          (call[1] as Record<string, unknown>).recursive === true
      );
    expect(recursiveCall).toBeDefined();
  });

  it("updates jobs.status='failed' with error message on failure", async () => {
    vi.mocked(clipLongform9x16).mockRejectedValueOnce(
      new Error("boom")
    );
    const { db, updateSets } = createMockDb({
      sourceRow,
      candidateRows: [makeCandidate("c1", 0, 5000)],
    });
    await expect(
      handleLongformClip(
        makeJob({ sourceId: "source-1", candidateIds: ["c1"] }),
        db as never
      )
    ).rejects.toThrow(/boom/);

    const failedUpdate = updateSets.find(
      (s) => (s as Record<string, unknown>).status === "failed"
    );
    expect(failedUpdate).toBeDefined();
    expect(
      (failedUpdate as Record<string, unknown>).errorMessage
    ).toBe("boom");
  });

  it("invokes job.updateProgress() during the run", async () => {
    const { db } = createMockDb({
      sourceRow,
      candidateRows: [makeCandidate("c1", 0, 5000)],
    });
    const job = makeJob({
      sourceId: "source-1",
      candidateIds: ["c1"],
    });
    await handleLongformClip(job, db as never);
    expect(job.updateProgress).toHaveBeenCalled();
    // final call should be 100
    const calls = (job.updateProgress as unknown as { mock: { calls: number[][] } })
      .mock.calls.map((c) => c[0]);
    expect(calls[calls.length - 1]).toBe(100);
  });

  it("uses mkdtemp under os.tmpdir() with a stable prefix", async () => {
    const { db } = createMockDb({
      sourceRow,
      candidateRows: [makeCandidate("c1", 0, 5000)],
    });
    await handleLongformClip(
      makeJob({ sourceId: "source-1", candidateIds: ["c1"] }),
      db as never
    );
    const mkdtempCall = vi.mocked(mkdtemp).mock.calls[0];
    expect(mkdtempCall[0]).toMatch(/longform-clip-/);
  });

  it("streams the clip upload from a file path (no readFile -> Buffer path)", async () => {
    // Regression: the previous implementation did
    // `readFile(outputPath)` then `uploadLongformClipBuffer(buffer)`,
    // which OOMed Railway workers on large clip batches because
    // every clip materialized its entire mp4 in RAM before upload.
    //
    // The streaming helper takes a filePath instead, so the test
    // asserts:
    //   (a) `uploadLongformClipFromPath` was called with a filePath
    //       (not a buffer), and
    //   (b) the handler never touches `fs/promises.readFile` on a
    //       clip output. We intentionally omit `readFile` from the
    //       `fs/promises` mock — if the handler ever re-adds it, the
    //       test file will throw a TypeError at runtime.
    const { db } = createMockDb({
      sourceRow,
      candidateRows: [makeCandidate("c1", 0, 5000)],
    });
    await handleLongformClip(
      makeJob({ sourceId: "source-1", candidateIds: ["c1"] }),
      db as never
    );
    expect(uploadLongformClipFromPath).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        candidateId: "c1",
        filePath: expect.stringMatching(/clip-c1\.mp4$/),
      })
    );
  });

  it("flips longformSources.status to 'clipping' on start and back to 'ready' on success", async () => {
    const { db, updateSets } = createMockDb({
      sourceRow,
      candidateRows: [makeCandidate("c1", 0, 5000)],
    });
    await handleLongformClip(
      makeJob({ sourceId: "source-1", candidateIds: ["c1"] }),
      db as never
    );
    // Extract the source.status transitions in order.
    const statusTransitions = updateSets
      .filter((s) => typeof (s as Record<string, unknown>).status === "string")
      .map((s) => (s as Record<string, unknown>).status as string);
    // Order of status updates on longform sources: clipping -> ready
    // (the 'failed' path is exercised in another test).
    expect(statusTransitions).toContain("clipping");
    expect(statusTransitions).toContain("ready");
    const clippingIdx = statusTransitions.indexOf("clipping");
    const readyIdx = statusTransitions.indexOf("ready");
    expect(clippingIdx).toBeLessThan(readyIdx);
  });

  it("releases longformSources.status back to 'ready' on failure (never stuck in 'clipping')", async () => {
    vi.mocked(clipLongform9x16).mockRejectedValueOnce(
      new Error("ffmpeg exploded")
    );
    const { db, updateSets } = createMockDb({
      sourceRow,
      candidateRows: [makeCandidate("c1", 0, 5000)],
    });
    await expect(
      handleLongformClip(
        makeJob({ sourceId: "source-1", candidateIds: ["c1"] }),
        db as never
      )
    ).rejects.toThrow(/ffmpeg exploded/);
    const statusUpdates = updateSets
      .filter((s) => typeof (s as Record<string, unknown>).status === "string")
      .map((s) => (s as Record<string, unknown>).status as string);
    expect(statusUpdates).toContain("clipping");
    expect(statusUpdates).toContain("ready");
  });

  it("skips re-upload and re-create when candidate already has a childProjectId (idempotent retry)", async () => {
    // Phase 7 retry 3, Codex HIGH-2A — the pre-upload idempotency
    // check queries the candidate row BEFORE running FFmpeg/upload.
    // If childProjectId is already set, the candidate was processed
    // by a prior attempt; we short-circuit to avoid orphaned uploads.
    const { db } = createMockDb({
      sourceRow,
      candidateRows: [makeCandidate("c1", 0, 5000)],
      // Simulate: pre-flight check finds childProjectId already set.
      preflightRows: [{ childProjectId: "proj-existing" }],
    });

    const result = await handleLongformClip(
      makeJob({ sourceId: "source-1", candidateIds: ["c1"] }),
      db as never
    );

    // Should NOT run FFmpeg or upload — candidate already done.
    expect(clipLongform9x16).not.toHaveBeenCalled();
    expect(uploadLongformClipFromPath).not.toHaveBeenCalled();
    expect(createChildProjectForClip).not.toHaveBeenCalled();

    // Should recover the existing project id into the result.
    expect(result.count).toBe(1);
    expect(result.childProjectIds).toEqual(["proj-existing"]);
  });

  it("processes new candidates normally even when a prior candidate is already done", async () => {
    // Phase 7 retry 3, HIGH-2A — mixed batch: first candidate already
    // has a childProjectId (skip), second does not (process normally).
    const { db } = createMockDb({
      sourceRow,
      candidateRows: [
        makeCandidate("c1", 0, 5000),
        makeCandidate("c2", 10_000, 15_000),
      ],
      preflightRows: [
        { childProjectId: "proj-existing" }, // c1: skip
        { childProjectId: null },             // c2: process
      ],
    });

    const result = await handleLongformClip(
      makeJob({ sourceId: "source-1", candidateIds: ["c1", "c2"] }),
      db as never
    );

    // Only c2 should trigger FFmpeg + upload + child project creation.
    expect(clipLongform9x16).toHaveBeenCalledTimes(1);
    expect(uploadLongformClipFromPath).toHaveBeenCalledTimes(1);
    expect(createChildProjectForClip).toHaveBeenCalledTimes(1);

    expect(result.count).toBe(2);
    expect(result.childProjectIds[0]).toBe("proj-existing");
    expect(result.childProjectIds[1]).toBe("proj-c2");
  });
});
