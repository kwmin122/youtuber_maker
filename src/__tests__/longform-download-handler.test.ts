import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock all external collaborators BEFORE importing the handler ---

vi.mock("@/lib/video/ytdlp", () => ({
  probeVideoMetadata: vi.fn(),
  downloadVideo: vi.fn(),
}));

vi.mock("@/lib/media/longform-storage", () => ({
  uploadLongformSource: vi.fn(),
  downloadLongformSource: vi.fn(),
  getLongformPublicUrl: vi.fn(),
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
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from("fake mp4 bytes")),
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

  // Awaiting `db.update(...).set(...).where(...)` should resolve.
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
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
    vi.mocked(longformStorage.uploadLongformSource).mockResolvedValue({
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
    expect(longformStorage.uploadLongformSource).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        sourceId: "src-1",
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
    expect(longformStorage.uploadLongformSource).not.toHaveBeenCalled();
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
