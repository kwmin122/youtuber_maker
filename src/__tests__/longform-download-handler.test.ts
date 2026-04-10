import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock all external collaborators BEFORE importing the handler ---

vi.mock("@/lib/video/ytdlp", () => ({
  probeVideoMetadata: vi.fn(),
  downloadVideo: vi.fn(),
}));

vi.mock("@/lib/media/longform-storage", () => ({
  uploadLongformSourceFromPath: vi.fn(),
  downloadLongformSourceToPath: vi.fn(),
  getLongformPublicUrl: vi.fn(),
  deleteLongformSource: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
  jobs: { id: "id" },
  jobEvents: {},
  longformSources: { id: "id" },
}));

vi.mock("fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("fs/promises")>("fs/promises");
  return {
    ...actual,
    mkdtemp: vi.fn().mockResolvedValue("/tmp/longform-dl-test"),
    rm: vi.fn().mockResolvedValue(undefined),
  };
});

import type { Job } from "bullmq";
import { handleLongformDownload } from "@/worker/handlers/longform-download";
import * as ytdlp from "@/lib/video/ytdlp";
import * as longformStorage from "@/lib/media/longform-storage";

/**
 * Build a chainable drizzle mock whose terminal methods return
 * either arrays (for selects) or no-op promises (for updates and
 * inserts). `selectRows` controls what `db.select().from().where()`
 * resolves to for the next call.
 */
function createMockDb(opts: {
  selectRows?: Array<Record<string, unknown>>;
} = {}) {
  const selectRows = opts.selectRows ?? [];

  // Awaiting `db.update(...).set(...).where(...).returning(...)` should
  // resolve. `.returning()` is appended to the builder chain BEFORE
  // await, so `.where()` must return a builder object, not a Promise.
  // The builder's `.returning()` then returns the awaitable Promise.
  //
  // By default, `.returning()` resolves to `[{ id: "src-1" }]`
  // (simulating 1 row successfully updated). The CAS guard checks
  // `transitioned.length === 0`, so a non-empty array passes the guard.
  const makeUpdateWhereChain = (returningRows: unknown[] = [{ id: "src-1" }]) => ({
    returning: vi.fn().mockResolvedValue(returningRows),
    // Plain `await db.update(...).set(...).where(...)` (without
    // `.returning()`) also needs to be awaitable for non-CAS updates.
    then: (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown
    ) => Promise.resolve(undefined).then(resolve, reject),
  });

  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(makeUpdateWhereChain()),
  };

  const insertChain = {
    values: vi.fn().mockResolvedValue(undefined),
  };

  // For select, `.where()` is the awaited terminal.
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(selectRows),
  };

  return {
    update: vi.fn().mockReturnValue(updateChain),
    insert: vi.fn().mockReturnValue(insertChain),
    select: vi.fn().mockReturnValue(selectChain),
    delete: vi.fn().mockReturnValue(updateChain),
  };
}

function makeJob(payload: Record<string, unknown>): Job {
  return {
    data: {
      jobId: "job-1",
      userId: "user-1",
      payload,
    },
  } as unknown as Job;
}

describe("handleLongformDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws if payload.sourceId is missing", async () => {
    const db = createMockDb();
    const job = makeJob({});
    await expect(
      handleLongformDownload(job, db as never)
    ).rejects.toThrow(/sourceId/);
  });

  it("throws if the source row is not found", async () => {
    const db = createMockDb({ selectRows: [] });
    const job = makeJob({ sourceId: "src-1" });
    await expect(
      handleLongformDownload(job, db as never)
    ).rejects.toThrow(/not found/i);
  });

  it("URL mode: probes, downloads, uploads, and marks source ready", async () => {
    const db = createMockDb({
      selectRows: [
        {
          id: "src-1",
          userId: "user-1",
          sourceType: "url",
          sourceUrl: "https://www.youtube.com/watch?v=abc",
          storagePath: null,
          publicUrl: null,
          title: null,
        },
      ],
    });

    vi.mocked(ytdlp.probeVideoMetadata).mockResolvedValue({
      id: "abc",
      title: "Fake video",
      durationSeconds: 600,
      webpageUrl: "https://www.youtube.com/watch?v=abc",
      ext: "mp4",
      filesizeApprox: 1024,
    });
    vi.mocked(ytdlp.downloadVideo).mockResolvedValue(undefined);
    vi.mocked(longformStorage.uploadLongformSourceFromPath).mockResolvedValue({
      storagePath: "user-1/src-1/source.mp4",
      publicUrl: "https://cdn/test.mp4",
    });

    const result = await handleLongformDownload(
      makeJob({ sourceId: "src-1" }),
      db as never
    );

    expect(ytdlp.probeVideoMetadata).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=abc"
    );
    expect(ytdlp.downloadVideo).toHaveBeenCalled();
    expect(longformStorage.uploadLongformSourceFromPath).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        sourceId: "src-1",
        filePath: expect.stringContaining("source.mp4"),
      })
    );

    expect(result).toEqual({
      sourceId: "src-1",
      durationSeconds: 600,
      title: "Fake video",
    });
  });

  it("URL mode: fails the source when duration is below the minimum", async () => {
    const db = createMockDb({
      selectRows: [
        {
          id: "src-1",
          userId: "user-1",
          sourceType: "url",
          sourceUrl: "https://x/y",
          storagePath: null,
          publicUrl: null,
          title: null,
        },
      ],
    });

    vi.mocked(ytdlp.probeVideoMetadata).mockResolvedValue({
      id: "x",
      title: "Too short",
      durationSeconds: 30, // below 120s minimum
      webpageUrl: "https://x/y",
      ext: "mp4",
      filesizeApprox: null,
    });

    await expect(
      handleLongformDownload(
        makeJob({ sourceId: "src-1" }),
        db as never
      )
    ).rejects.toThrow(/too short/i);

    // downloadVideo/upload should NOT have been called
    expect(ytdlp.downloadVideo).not.toHaveBeenCalled();
    expect(longformStorage.uploadLongformSourceFromPath).not.toHaveBeenCalled();
  });

  it("URL mode: fails when the source row has no sourceUrl", async () => {
    const db = createMockDb({
      selectRows: [
        {
          id: "src-1",
          userId: "user-1",
          sourceType: "url",
          sourceUrl: null,
          storagePath: null,
          publicUrl: null,
          title: null,
        },
      ],
    });

    await expect(
      handleLongformDownload(
        makeJob({ sourceId: "src-1" }),
        db as never
      )
    ).rejects.toThrow(/sourceUrl/);
  });

  it("aborts when compare-and-set pending->downloading finds no matching row (HIGH-1)", async () => {
    // Phase 7 retry 3, HIGH-1 — the CAS now uses `.returning()` so we
    // get a type-safe array instead of the postgres-js `.count` vs
    // `.rowCount` mismatch. An empty array means 0 rows affected.
    const makeWhereChainReturning = (rows: unknown[]) => ({
      returning: vi.fn().mockResolvedValue(rows),
      then: (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown
      ) => Promise.resolve(undefined).then(resolve, reject),
    });
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      // Return empty array from `.returning()` to simulate 0 rows affected.
      where: vi.fn().mockReturnValue(makeWhereChainReturning([])),
    };
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        {
          id: "src-1",
          userId: "user-1",
          sourceType: "url",
          sourceUrl: "https://www.youtube.com/watch?v=abc",
          storagePath: null,
          publicUrl: null,
          status: "ready", // already past the downloading stage
          title: null,
        },
      ]),
    };
    const db = {
      update: vi.fn().mockReturnValue(updateChain),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
      select: vi.fn().mockReturnValue(selectChain),
      delete: vi.fn(),
    };

    await expect(
      handleLongformDownload(makeJob({ sourceId: "src-1" }), db as never)
    ).rejects.toThrow(/not in a pending\/failed state/);

    // Must NOT have gone on to probe/download/upload.
    expect(ytdlp.probeVideoMetadata).not.toHaveBeenCalled();
    expect(ytdlp.downloadVideo).not.toHaveBeenCalled();
    expect(longformStorage.uploadLongformSourceFromPath).not.toHaveBeenCalled();
  });

  it("URL mode: streams upload via filePath (no readFile -> Buffer)", async () => {
    // Regression: the old handler did
    // `const buffer = await readFile(finalPath); upload(buffer)`,
    // which peaked worker RAM at the full mp4 size and OOMed Railway
    // on 2 GB inputs. The streaming helper takes a filePath and
    // pipes bytes straight to Supabase Storage.
    const db = createMockDb({
      selectRows: [
        {
          id: "src-1",
          userId: "user-1",
          sourceType: "url",
          sourceUrl: "https://www.youtube.com/watch?v=abc",
          storagePath: null,
          publicUrl: null,
          title: null,
        },
      ],
    });
    vi.mocked(ytdlp.probeVideoMetadata).mockResolvedValue({
      id: "abc",
      title: "Fake video",
      durationSeconds: 600,
      webpageUrl: "https://www.youtube.com/watch?v=abc",
      ext: "mp4",
      filesizeApprox: 1024,
    });
    vi.mocked(ytdlp.downloadVideo).mockResolvedValue(undefined);
    vi.mocked(longformStorage.uploadLongformSourceFromPath).mockResolvedValue({
      storagePath: "user-1/src-1/source.mp4",
      publicUrl: "https://cdn/test.mp4",
    });
    await handleLongformDownload(
      makeJob({ sourceId: "src-1" }),
      db as never
    );
    // Called with a filePath, never a buffer.
    const call = vi.mocked(longformStorage.uploadLongformSourceFromPath).mock
      .calls[0][0];
    expect(call).toHaveProperty("filePath");
    expect(call).not.toHaveProperty("buffer");
  });

  it("URL mode: deletes orphan storage object if DB update fails after upload", async () => {
    // Regression for Phase 7 concern: previously, a mid-job crash
    // after `uploadLongformSource` but before
    // `longform_sources.status='ready'` left the mp4 orphaned in the
    // longform-sources bucket. The fix tracks `uploadedPath` in a
    // local variable and deletes it from the catch block.
    const setCalls: Array<Record<string, unknown>> = [];
    const updateChain = {
      set: vi.fn(function (this: unknown, v: Record<string, unknown>) {
        setCalls.push(v);
        return updateChain;
      }),
      where: vi.fn(),
    };
    // Fail when the call tries to transition to `status='ready'` on
    // the longform source. This is the update that runs *after* the
    // upload has succeeded, so the orphan cleanup path must fire.
    // Phase 7 retry 3: `.where()` must return a builder object with
    // `.returning()` for the CAS call (status='downloading'), and
    // reject directly for status='ready'.
    updateChain.where.mockImplementation(() => {
      const last = setCalls[setCalls.length - 1];
      if (last && last.status === "ready") {
        return Promise.reject(new Error("db transient failure"));
      }
      if (last && last.status === "downloading") {
        // CAS transition — return builder with .returning() that resolves
        // with one row (simulating a successful status flip).
        return {
          returning: vi.fn().mockResolvedValue([{ id: "src-1" }]),
          then: (
            resolve: (v: unknown) => unknown,
            reject: (e: unknown) => unknown
          ) => Promise.resolve(undefined).then(resolve, reject),
        };
      }
      return Promise.resolve(undefined);
    });
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        {
          id: "src-1",
          userId: "user-1",
          sourceType: "url",
          sourceUrl: "https://y/z",
          storagePath: null,
          publicUrl: null,
          title: null,
        },
      ]),
    };
    const insertChain = { values: vi.fn().mockResolvedValue(undefined) };
    const db = {
      update: vi.fn().mockReturnValue(updateChain),
      insert: vi.fn().mockReturnValue(insertChain),
      select: vi.fn().mockReturnValue(selectChain),
      delete: vi.fn().mockReturnValue(updateChain),
    };

    vi.mocked(ytdlp.probeVideoMetadata).mockResolvedValue({
      id: "abc",
      title: "Fake video",
      durationSeconds: 600,
      webpageUrl: "https://y/z",
      ext: "mp4",
      filesizeApprox: 1024,
    });
    vi.mocked(ytdlp.downloadVideo).mockResolvedValue(undefined);
    vi.mocked(longformStorage.uploadLongformSourceFromPath).mockResolvedValue({
      storagePath: "user-1/src-1/source.mp4",
      publicUrl: "https://cdn/test.mp4",
    });

    await expect(
      handleLongformDownload(
        makeJob({ sourceId: "src-1" }),
        db as never
      )
    ).rejects.toThrow(/db transient failure/);

    // Orphan cleanup must have been called with the uploaded path.
    expect(longformStorage.deleteLongformSource).toHaveBeenCalledWith(
      "user-1/src-1/source.mp4"
    );
  });

  it("rejects an unknown sourceType", async () => {
    const db = createMockDb({
      selectRows: [
        {
          id: "src-1",
          userId: "user-1",
          sourceType: "ftp",
          sourceUrl: null,
          storagePath: null,
          publicUrl: null,
          title: null,
        },
      ],
    });

    await expect(
      handleLongformDownload(
        makeJob({ sourceId: "src-1" }),
        db as never
      )
    ).rejects.toThrow(/Unknown sourceType/);
  });
});
