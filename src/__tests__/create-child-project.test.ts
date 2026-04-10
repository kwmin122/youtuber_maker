import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the schema module so we can distinguish insert targets by identity.
vi.mock("@/lib/db/schema", () => ({
  projects: { __name: "projects" },
  scripts: { __name: "scripts" },
  scenes: { __name: "scenes" },
  mediaAssets: { __name: "mediaAssets" },
  longformCandidates: { __name: "longformCandidates", id: "id" },
  longformSources: { __name: "longformSources" },
}));

// Minimal DEFAULT_SUBTITLE_STYLE stand-in so we don't bring in the
// full types module (which imports other heavy things).
vi.mock("@/lib/video/types", () => ({
  DEFAULT_SUBTITLE_STYLE: { fontFamily: "Noto Sans KR" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ __eq: [col, val] })),
}));

// The module imports `db` from "@/lib/db"; we stub it with a
// transaction-capable fake that records calls.
vi.mock("@/lib/db", () => {
  return {
    db: {
      transaction: vi.fn(),
    },
  };
});

import { createChildProjectForClip } from "@/lib/longform/create-child-project";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

type Values = Record<string, unknown>;

interface InsertCall {
  table: unknown;
  values: Values;
}

interface UpdateCall {
  table: unknown;
  values: Values;
  where: unknown;
}

/**
 * Build a fake `tx` object that mirrors the shape used by the
 * factory: tx.insert(table).values(v).returning() and
 * tx.update(table).set(v).where(w).
 *
 * Returns the tx plus arrays recording every call for assertions.
 */
function makeTx() {
  const insertCalls: InsertCall[] = [];
  const updateCalls: UpdateCall[] = [];

  let insertCount = 0;

  const tx = {
    insert: (table: unknown) => ({
      values: (values: Values) => {
        insertCalls.push({ table, values });
        insertCount += 1;
        const stableId = `id-${insertCount}`;
        return {
          returning: async () => {
            if (
              table === schema.projects ||
              table === schema.scripts ||
              table === schema.scenes
            ) {
              return [{ id: stableId }];
            }
            return [];
          },
          // Allow awaiting without .returning() for media_assets insert.
          then: (resolve: (v: unknown) => unknown) => resolve(undefined),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Values) => ({
        where: async (where: unknown) => {
          updateCalls.push({ table, values, where });
        },
      }),
    }),
  };

  return { tx, insertCalls, updateCalls };
}

const mockedDb = vi.mocked(db);

describe("createChildProjectForClip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseParams = () => ({
    userId: "user-1",
    source: {
      id: "source-1",
      title: "Test Source",
      userId: "user-1",
    } as never,
    candidate: {
      id: "cand-1",
      startMs: 1000,
      endMs: 61_000,
      reason: "Hook is strong",
      titleSuggestion: "Wait till you see this",
      transcriptSnippet: "Hello world this is a test snippet",
    } as never,
    clipPublicUrl: "https://cdn.example/clip.mp4",
    clipStoragePath: "user-1/longform-clips/cand-1.mp4",
  });

  it("runs all inserts inside a single db.transaction call", async () => {
    const { tx, insertCalls, updateCalls } = makeTx();
    mockedDb.transaction.mockImplementation(async (cb) => cb(tx as never));

    const result = await createChildProjectForClip(baseParams());

    expect(mockedDb.transaction).toHaveBeenCalledTimes(1);
    // projects, scripts, scenes, media_assets = 4 inserts
    expect(insertCalls).toHaveLength(4);
    // longform_candidates update = 1 update
    expect(updateCalls).toHaveLength(1);

    expect(result.projectId).toBe("id-1");
    expect(result.scriptId).toBe("id-2");
    expect(result.sceneId).toBe("id-3");
  });

  it("inserts projects with parentLongformId and fromLongform flag", async () => {
    const { tx, insertCalls } = makeTx();
    mockedDb.transaction.mockImplementation(async (cb) => cb(tx as never));
    await createChildProjectForClip(baseParams());
    const projectInsert = insertCalls.find((c) => c.table === schema.projects);
    expect(projectInsert).toBeDefined();
    expect(projectInsert!.values.parentLongformId).toBe("source-1");
    expect(projectInsert!.values.title).toBe("Wait till you see this");
    expect(projectInsert!.values.userId).toBe("user-1");
    const ws = projectInsert!.values.workflowState as Record<string, unknown>;
    expect(ws.currentStep).toBe(4);
    expect((ws.draftFlags as Record<string, boolean>).fromLongform).toBe(true);
  });

  it("inserts scripts with analysisId=null and variant=longform", async () => {
    const { tx, insertCalls } = makeTx();
    mockedDb.transaction.mockImplementation(async (cb) => cb(tx as never));
    await createChildProjectForClip(baseParams());
    const scriptInsert = insertCalls.find((c) => c.table === schema.scripts);
    expect(scriptInsert).toBeDefined();
    expect(scriptInsert!.values.analysisId).toBeNull();
    expect(scriptInsert!.values.variant).toBe("longform");
    expect(scriptInsert!.values.structureType).toBe("longform-clip");
    expect(scriptInsert!.values.content).toBe(
      "Hello world this is a test snippet"
    );
    expect(scriptInsert!.values.wordCount).toBe(7);
    expect(scriptInsert!.values.estimatedDuration).toBe(60);
  });

  it("inserts scenes with sourceType=longform-clip and start/end ms", async () => {
    const { tx, insertCalls } = makeTx();
    mockedDb.transaction.mockImplementation(async (cb) => cb(tx as never));
    await createChildProjectForClip(baseParams());
    const sceneInsert = insertCalls.find((c) => c.table === schema.scenes);
    expect(sceneInsert).toBeDefined();
    expect(sceneInsert!.values.sourceType).toBe("longform-clip");
    expect(sceneInsert!.values.sourceClipStartMs).toBe(1000);
    expect(sceneInsert!.values.sourceClipEndMs).toBe(61_000);
    expect(sceneInsert!.values.sourceLongformId).toBe("source-1");
    expect(sceneInsert!.values.sceneIndex).toBe(0);
    expect(sceneInsert!.values.duration).toBe(60);
    expect(sceneInsert!.values.transitionType).toBe("cut");
  });

  it("inserts media_assets pointing at the clip url and storage path", async () => {
    const { tx, insertCalls } = makeTx();
    mockedDb.transaction.mockImplementation(async (cb) => cb(tx as never));
    await createChildProjectForClip(baseParams());
    const mediaInsert = insertCalls.find(
      (c) => c.table === schema.mediaAssets
    );
    expect(mediaInsert).toBeDefined();
    expect(mediaInsert!.values.type).toBe("video");
    expect(mediaInsert!.values.url).toBe("https://cdn.example/clip.mp4");
    expect(mediaInsert!.values.storagePath).toBe(
      "user-1/longform-clips/cand-1.mp4"
    );
    expect(mediaInsert!.values.provider).toBe("ffmpeg-longform-clip");
    expect(mediaInsert!.values.status).toBe("completed");
    expect(mediaInsert!.values.sceneId).toBe("id-3");
  });

  it("updates longform_candidates.selected=true and childProjectId", async () => {
    const { tx, updateCalls } = makeTx();
    mockedDb.transaction.mockImplementation(async (cb) => cb(tx as never));
    await createChildProjectForClip(baseParams());
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe(schema.longformCandidates);
    expect(updateCalls[0].values.selected).toBe(true);
    expect(updateCalls[0].values.childProjectId).toBe("id-1");
  });

  it("throws when endMs <= startMs", async () => {
    mockedDb.transaction.mockImplementation(async () => {
      throw new Error("should not reach transaction");
    });
    const params = baseParams();
    (params.candidate as unknown as { startMs: number }).startMs = 5000;
    (params.candidate as unknown as { endMs: number }).endMs = 5000;
    await expect(createChildProjectForClip(params)).rejects.toThrow(
      /Invalid candidate duration/
    );
  });

  it("falls back to source.title when titleSuggestion is missing", async () => {
    const { tx, insertCalls } = makeTx();
    mockedDb.transaction.mockImplementation(async (cb) => cb(tx as never));
    const params = baseParams();
    (params.candidate as unknown as { titleSuggestion: string | null }).titleSuggestion = null;
    await createChildProjectForClip(params);
    const projectInsert = insertCalls.find((c) => c.table === schema.projects);
    expect(projectInsert!.values.title).toBe("Test Source");
  });
});
