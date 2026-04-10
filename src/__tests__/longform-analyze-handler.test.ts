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

  const updateChain = {
    set: vi.fn().mockImplementation(function (this: unknown, v: Record<string, unknown>) {
      updateCalls.push({ set: v });
      return updateChain;
    }),
    where: vi.fn().mockResolvedValue(undefined),
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

const VALID_GEMINI_RESPONSE = JSON.stringify({
  candidates: [
    {
      startMs: 0,
      endMs: 45_000,
      hookScore: 80,
      emotionalScore: 70,
      informationDensity: 60,
      trendScore: 50,
      reason: "Strong opener",
      titleSuggestion: "You won't believe it",
      transcriptSnippet: "Intro segment",
    },
    {
      startMs: 100_000,
      endMs: 145_000,
      hookScore: 90,
      emotionalScore: 85,
      informationDensity: 75,
      trendScore: 80,
      reason: "Surprise twist",
      titleSuggestion: "Wait... what?",
      transcriptSnippet: "Mid segment",
    },
  ],
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
    expect(result.candidateCount).toBe(2);
    expect(generateTextWithModel).toHaveBeenCalledTimes(1);
    expect(generateJsonFromAudio).not.toHaveBeenCalled();
    // Audio helpers must not be touched
    expect(downloadLongformSourceToPath).not.toHaveBeenCalled();
    expect(extractAudioForAnalysis).not.toHaveBeenCalled();

    // Candidates were inserted
    const candidateInsert = tracked.insertCalls.find(
      (call) => Array.isArray(call.values) && (call.values as unknown[]).length === 2
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
    expect(result.candidateCount).toBe(2);
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

    await expect(
      handleLongformAnalyze(job, tracked.db as never)
    ).rejects.toThrow(/zero valid candidates/);
  });
});
