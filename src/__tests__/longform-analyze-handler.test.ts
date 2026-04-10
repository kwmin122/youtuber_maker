import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies before importing the handler
vi.mock("@/lib/ai/get-user-ai-client", () => ({
  getUserAIClient: vi.fn(),
}));
vi.mock("@/lib/youtube/transcript", () => ({
  fetchTranscript: vi.fn(),
}));
vi.mock("@/lib/youtube/parse-url", () => ({
  parseVideoUrl: vi.fn(),
}));
vi.mock("@/lib/media/longform-storage", () => ({
  downloadLongformSourceToPath: vi.fn(),
}));
vi.mock("@/lib/video/extract-audio", () => ({
  extractAudioForAnalysis: vi.fn(),
}));
vi.mock("fs/promises", async () => {
  return {
    mkdtemp: vi.fn().mockResolvedValue("/tmp/longform-analyze-xyz"),
    rm: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock("@/lib/db/schema", () => ({
  jobs: { id: "id" },
  jobEvents: {},
  longformSources: { id: "id" },
  longformCandidates: { id: "id" },
}));

import { handleLongformAnalyze } from "@/worker/handlers/longform-analyze";
import { getUserAIClient } from "@/lib/ai/get-user-ai-client";
import { fetchTranscript } from "@/lib/youtube/transcript";
import { parseVideoUrl } from "@/lib/youtube/parse-url";
import { downloadLongformSourceToPath } from "@/lib/media/longform-storage";
import { extractAudioForAnalysis } from "@/lib/video/extract-audio";
import type { Job } from "bullmq";

type TrackedDb = ReturnType<typeof createMockDb>;

function createMockJob(data: Record<string, unknown>): Job {
  return { data } as unknown as Job;
}

/**
 * Create a drizzle-shaped mock where `select().from().where()` returns
 * the provided `sourceRow`, and all update/insert chains resolve.
 * Also records insert calls so tests can assert candidate shape.
 */
function createMockDb(options: {
  sourceRow: Record<string, unknown> | undefined;
}) {
  const insertCalls: Array<{ values: unknown }> = [];
  const updateCalls: Array<{ set: Record<string, unknown> }> = [];

  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation(() =>
      options.sourceRow ? Promise.resolve([options.sourceRow]) : Promise.resolve([])
    ),
  };

  const insertChain = {
    values: vi.fn().mockImplementation(function (this: unknown, v: unknown) {
      insertCalls.push({ values: v });
      return Promise.resolve();
    }),
    returning: vi.fn().mockResolvedValue([{ id: "new-id" }]),
  };

  // `.where()` must return a builder object (not a Promise) so that
  // `.returning()` can be called on it for the CAS transition. The
  // builder also implements `.then()` so it is directly `await`-able
  // for non-CAS update calls that do not chain `.returning()`.
  //
  // Default: `.returning()` resolves to `[{ id: "row-id" }]` — 1 row
  // updated, so the CAS guard (`transitioned.length === 0`) passes.
  // Phase 7 retry 3, Codex HIGH-1 fix.
  const makeWhereResult = () => ({
    returning: vi.fn().mockResolvedValue([{ id: "row-id" }]),
    then: (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown
    ) => Promise.resolve(undefined).then(resolve, reject),
  });

  const updateChain = {
    set: vi.fn().mockImplementation(function (this: unknown, v: Record<string, unknown>) {
      updateCalls.push({ set: v });
      return updateChain;
    }),
    where: vi.fn().mockReturnValue(makeWhereResult()),
  };

  return {
    insertCalls,
    updateCalls,
    db: {
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn().mockReturnValue(insertChain),
      update: vi.fn().mockReturnValue(updateChain),
      delete: vi.fn(),
    },
  };
}

// 5 non-overlapping candidates so parseAndValidateCandidates'
// HIGH-4 minimum (5) is satisfied.
const VALID_GEMINI_RESPONSE = JSON.stringify({
  candidates: Array.from({ length: 5 }, (_, i) => ({
    startMs: i * 70_000,
    endMs: i * 70_000 + 45_000,
    hookScore: 80,
    emotionalScore: 70,
    informationDensity: 60,
    trendScore: 50,
    reason: `Strong segment ${i}`,
    titleSuggestion: `Title ${i}`,
    transcriptSnippet: `Segment ${i} snippet`,
  })),
});

describe("handleLongformAnalyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when sourceId is missing from payload", async () => {
    const job = createMockJob({
      jobId: "job-1",
      userId: "user-1",
      payload: {},
    });
    const tracked = createMockDb({ sourceRow: undefined });
    await expect(
      handleLongformAnalyze(job, tracked.db as never)
    ).rejects.toThrow("sourceId is required");
  });

  it("throws when the source row does not exist", async () => {
    const job = createMockJob({
      jobId: "job-1",
      userId: "user-1",
      payload: { sourceId: "missing" },
    });
    const tracked = createMockDb({ sourceRow: undefined });
    // Gemini client mock so we don't fail on provider resolution first
    vi.mocked(getUserAIClient).mockResolvedValue({
      provider: {
        name: "gemini",
        generateText: vi.fn(),
        generateTextWithModel: vi.fn(),
        generateJsonFromAudio: vi.fn(),
      },
      keyId: "k1",
    });
    await expect(
      handleLongformAnalyze(job, tracked.db as never)
    ).rejects.toThrow(/not found/);
  });

  it("throws when source status is not 'ready'", async () => {
    const job = createMockJob({
      jobId: "job-1",
      userId: "user-1",
      payload: { sourceId: "s1" },
    });
    const tracked = createMockDb({
      sourceRow: {
        id: "s1",
        userId: "user-1",
        status: "pending",
        sourceType: "url",
        sourceUrl: "https://youtube.com/watch?v=abc",
        storagePath: null,
        title: "t",
        durationSeconds: 600,
      },
    });
    await expect(
      handleLongformAnalyze(job, tracked.db as never)
    ).rejects.toThrow(/status=pending/);
  });

  it("chooses transcript mode when YouTube captions are available", async () => {
    const job = createMockJob({
      jobId: "job-1",
      userId: "user-1",
      payload: { sourceId: "s1", targetCount: 5 },
    });
    const tracked = createMockDb({
      sourceRow: {
        id: "s1",
        userId: "user-1",
        status: "ready",
        sourceType: "url",
        sourceUrl: "https://youtube.com/watch?v=abcdefghijk",
        storagePath: null,
        title: "A video",
        durationSeconds: 600,
      },
    });

    const generateTextWithModel = vi.fn().mockResolvedValue(VALID_GEMINI_RESPONSE);
    const generateJsonFromAudio = vi.fn();
    vi.mocked(getUserAIClient).mockResolvedValue({
      provider: {
        name: "gemini",
        generateText: vi.fn(),
        generateTextWithModel,
        generateJsonFromAudio,
      },
      keyId: "k1",
    });
    vi.mocked(parseVideoUrl).mockReturnValue({ videoId: "abcdefghijk" });
    vi.mocked(fetchTranscript).mockResolvedValue({
      segments: [{ text: "hello", offset: 0, duration: 2000 }],
      fullText: "hello",
      language: "en",
      source: "youtube-transcript",
    });

    const result = await handleLongformAnalyze(job, tracked.db as never);

    expect(result.mode).toBe("transcript");
    expect(result.candidateCount).toBe(5);
    expect(generateTextWithModel).toHaveBeenCalledTimes(1);
    expect(generateJsonFromAudio).not.toHaveBeenCalled();
    // Audio helpers must not be touched
    expect(downloadLongformSourceToPath).not.toHaveBeenCalled();
    expect(extractAudioForAnalysis).not.toHaveBeenCalled();

    // Candidates were inserted
    const candidateInsert = tracked.insertCalls.find(
      (call) => Array.isArray(call.values) && (call.values as unknown[]).length === 5
    );
    expect(candidateInsert).toBeDefined();

    // Final status=ready on longform_sources, status=completed on job
    const statusUpdates = tracked.updateCalls
      .map((c) => c.set.status)
      .filter(Boolean);
    expect(statusUpdates).toContain("analyzing");
    expect(statusUpdates).toContain("completed");
    expect(statusUpdates).toContain("ready");
  });

  it("falls back to audio mode when YouTube has no captions", async () => {
    const job = createMockJob({
      jobId: "job-1",
      userId: "user-1",
      payload: { sourceId: "s1" },
    });
    const tracked = createMockDb({
      sourceRow: {
        id: "s1",
        userId: "user-1",
        status: "ready",
        sourceType: "url",
        sourceUrl: "https://youtube.com/watch?v=abcdefghijk",
        storagePath: "user-1/s1/source.mp4",
        title: "A video",
        durationSeconds: 600,
      },
    });

    const generateTextWithModel = vi.fn();
    const generateJsonFromAudio = vi.fn().mockResolvedValue(VALID_GEMINI_RESPONSE);
    vi.mocked(getUserAIClient).mockResolvedValue({
      provider: {
        name: "gemini",
        generateText: vi.fn(),
        generateTextWithModel,
        generateJsonFromAudio,
      },
      keyId: "k1",
    });
    vi.mocked(parseVideoUrl).mockReturnValue({ videoId: "abcdefghijk" });
    vi.mocked(fetchTranscript).mockResolvedValue(null);
    vi.mocked(downloadLongformSourceToPath).mockResolvedValue(undefined);
    vi.mocked(extractAudioForAnalysis).mockResolvedValue(undefined);

    const result = await handleLongformAnalyze(job, tracked.db as never);

    expect(result.mode).toBe("audio");
    expect(result.candidateCount).toBe(5);
    // The source must be streamed to disk, NEVER buffered via
    // readFile/arrayBuffer first. Phase 7 retry 2 CRITICAL-3.
    expect(downloadLongformSourceToPath).toHaveBeenCalledTimes(1);
    expect(downloadLongformSourceToPath).toHaveBeenCalledWith({
      storagePath: "user-1/s1/source.mp4",
      destPath: expect.stringContaining("source.mp4"),
    });
    expect(extractAudioForAnalysis).toHaveBeenCalledTimes(1);
    expect(generateJsonFromAudio).toHaveBeenCalledTimes(1);
    expect(generateTextWithModel).not.toHaveBeenCalled();
  });

  it("uses audio mode directly for uploaded files", async () => {
    const job = createMockJob({
      jobId: "job-1",
      userId: "user-1",
      payload: { sourceId: "s1" },
    });
    const tracked = createMockDb({
      sourceRow: {
        id: "s1",
        userId: "user-1",
        status: "ready",
        sourceType: "file",
        sourceUrl: null,
        storagePath: "user-1/s1/uploaded.mp4",
        title: "Uploaded",
        durationSeconds: 600,
      },
    });

    const generateJsonFromAudio = vi.fn().mockResolvedValue(VALID_GEMINI_RESPONSE);
    vi.mocked(getUserAIClient).mockResolvedValue({
      provider: {
        name: "gemini",
        generateText: vi.fn(),
        generateTextWithModel: vi.fn(),
        generateJsonFromAudio,
      },
      keyId: "k1",
    });
    vi.mocked(downloadLongformSourceToPath).mockResolvedValue(undefined);
    vi.mocked(extractAudioForAnalysis).mockResolvedValue(undefined);

    const result = await handleLongformAnalyze(job, tracked.db as never);

    expect(result.mode).toBe("audio");
    expect(fetchTranscript).not.toHaveBeenCalled();
    expect(generateJsonFromAudio).toHaveBeenCalledTimes(1);
  });

  it("throws when Gemini returns zero valid candidates", async () => {
    const job = createMockJob({
      jobId: "job-1",
      userId: "user-1",
      payload: { sourceId: "s1" },
    });
    const tracked = createMockDb({
      sourceRow: {
        id: "s1",
        userId: "user-1",
        status: "ready",
        sourceType: "url",
        sourceUrl: "https://youtube.com/watch?v=abcdefghijk",
        storagePath: null,
        title: "t",
        durationSeconds: 600,
      },
    });

    vi.mocked(getUserAIClient).mockResolvedValue({
      provider: {
        name: "gemini",
        generateText: vi.fn(),
        generateTextWithModel: vi
          .fn()
          .mockResolvedValue(JSON.stringify({ candidates: [] })),
        generateJsonFromAudio: vi.fn(),
      },
      keyId: "k1",
    });
    vi.mocked(parseVideoUrl).mockReturnValue({ videoId: "abcdefghijk" });
    vi.mocked(fetchTranscript).mockResolvedValue({
      segments: [{ text: "hi", offset: 0, duration: 1000 }],
      fullText: "hi",
      language: "en",
      source: "youtube-transcript",
    });

    // Phase 7 retry 2, HIGH-4 — the handler now translates the
    // validator's InsufficientCandidatesError into a user-facing
    // Korean message before rethrowing, so empty/insufficient
    // responses surface a clear "try another video" string on the
    // source row's errorMessage.
    await expect(
      handleLongformAnalyze(job, tracked.db as never)
    ).rejects.toThrow(/AI 분석이 충분한 후보 구간을 찾지 못했습니다/);
  });

  it("aborts when CAS ready→analyzing finds no matching row (HIGH-1 fix)", async () => {
    // Phase 7 retry 3, Codex HIGH-1 — the CAS now uses `.returning()`
    // so the check is driver-portable. An empty array from `.returning()`
    // means 0 rows affected (e.g. source is already in 'analyzing'
    // from a concurrent worker). The handler must abort rather than
    // silently overwriting a later state.
    const insertCalls: Array<unknown> = [];
    const updateCalls: Array<{ set: Record<string, unknown> }> = [];

    // Override where to return a builder whose .returning() gives [].
    const makeEmptyReturning = () => ({
      returning: vi.fn().mockResolvedValue([]),
      then: (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown
      ) => Promise.resolve(undefined).then(resolve, reject),
    });

    const updateChain = {
      set: vi.fn().mockImplementation(function (this: unknown, v: Record<string, unknown>) {
        updateCalls.push({ set: v });
        return updateChain;
      }),
      where: vi.fn().mockReturnValue(makeEmptyReturning()),
    };
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        {
          id: "s1",
          userId: "user-1",
          status: "ready",
          sourceType: "url",
          sourceUrl: "https://youtube.com/watch?v=abc",
          storagePath: null,
          title: "t",
          durationSeconds: 600,
        },
      ]),
    };
    const insertChain = {
      values: vi.fn().mockImplementation((v: unknown) => {
        insertCalls.push(v);
        return Promise.resolve();
      }),
      returning: vi.fn().mockResolvedValue([{ id: "new-id" }]),
    };
    const db = {
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn().mockReturnValue(insertChain),
      update: vi.fn().mockReturnValue(updateChain),
      delete: vi.fn(),
    };

    const job = createMockJob({
      jobId: "job-1",
      userId: "user-1",
      payload: { sourceId: "s1" },
    });

    // getUserAIClient won't even be reached — the CAS abort fires first.
    await expect(
      handleLongformAnalyze(job, db as never)
    ).rejects.toThrow(/not in 'ready' state/);

    // AI client and audio helpers must not have been called.
    expect(downloadLongformSourceToPath).not.toHaveBeenCalled();
    expect(extractAudioForAnalysis).not.toHaveBeenCalled();
  });
});
