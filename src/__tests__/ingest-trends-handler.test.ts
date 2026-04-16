/**
 * Phase 9 plan 09-02 — unit tests for handleIngestTrends
 *
 * Uses mocked YouTube + Google Trends clients and in-memory DB state.
 * Covers: happy path, partial (Google Trends empty), partial (Google
 * Trends throws), and idempotency (duplicate row conflict handling).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external dependencies BEFORE imports
vi.mock("@/lib/youtube/client", () => ({
  getTrendingVideos: vi.fn(),
}));
vi.mock("@/lib/trends/google-trends-client", () => ({
  fetchDailyTrends: vi.fn(),
}));
vi.mock("@/lib/queue", () => ({
  getQueue: () => ({ add: vi.fn() }),
}));
vi.mock("@/lib/env", () => ({
  env: {
    YOUTUBE_API_KEY: "test-key",
    GOOGLE_TRENDS_ENABLED: false,
  },
}));

import { getTrendingVideos } from "@/lib/youtube/client";
import { fetchDailyTrends } from "@/lib/trends/google-trends-client";
import { handleIngestTrends } from "@/worker/handlers/ingest-trends";

// In-memory state to simulate DB interactions
type IngestionRun = {
  id: string;
  status: string;
  endedAt?: Date | null;
  categoryCount?: number;
  successCount?: number;
  partialCount?: number;
  failureCount?: number;
  errorDetails?: Record<string, unknown> | null;
};

type TrendSnapshot = {
  id: string;
  categoryId: number;
  regionCode: string;
  keyword: string;
  rank: number;
  source: string;
  videoCount?: number | null;
  rawPayload?: Record<string, unknown> | null;
};

type Job = {
  id: string;
  userId: string;
  type: string;
  status: string;
};

function makeMockDb(initial: {
  runs: Record<string, IngestionRun>;
  snapshots: TrendSnapshot[];
  jobs: Job[];
  users: Array<{ userId: string }>;
}) {
  const state = {
    runs: { ...initial.runs },
    snapshots: [...initial.snapshots],
    jobs: [...initial.jobs],
    users: [...initial.users],
  };

  const db = {
    update: vi.fn((table: unknown) => {
      // Return a builder that records the .set and .where calls
      const builder = {
        _table: table,
        _set: {},
        _where: null,
        set(values: Record<string, unknown>) {
          builder._set = values;
          return builder;
        },
        where(condition: unknown) {
          builder._where = condition;
          return builder;
        },
        returning(fields: unknown) {
          // Apply update to runs
          if (builder._where && typeof (builder._where as Record<string, unknown>)._id === "string") {
            const id = (builder._where as Record<string, unknown>)._id as string;
            if (state.runs[id]) {
              Object.assign(state.runs[id], builder._set);
              if (fields) return Promise.resolve([{ id }]);
            }
            return Promise.resolve([]);
          }
          // For simplicity, apply to first run
          const runIds = Object.keys(state.runs);
          if (runIds.length > 0) {
            Object.assign(state.runs[runIds[0]], builder._set);
            if (fields) return Promise.resolve([{ id: runIds[0] }]);
          }
          return Promise.resolve([]);
        },
        then(resolve: Function) {
          // Apply update without returning
          const runIds = Object.keys(state.runs);
          if (runIds.length > 0) {
            Object.assign(state.runs[runIds[0]], builder._set);
          }
          return Promise.resolve().then(() => resolve(undefined));
        },
      };
      return builder;
    }),
    insert: vi.fn((table: unknown) => {
      const builder = {
        _values: [] as unknown[],
        values(v: unknown) {
          builder._values = Array.isArray(v) ? v : [v];
          return builder;
        },
        onConflictDoNothing() {
          // Simulate conflict detection by deduplicating by (keyword, source, categoryId)
          const newRows = builder._values as TrendSnapshot[];
          for (const row of newRows) {
            const exists = state.snapshots.some(
              (s) =>
                s.keyword === row.keyword &&
                s.source === row.source &&
                s.categoryId === row.categoryId &&
                s.regionCode === row.regionCode
            );
            if (!exists) {
              state.snapshots.push({
                ...row,
                id: `snap-${Math.random()}`,
              });
            }
          }
          return Promise.resolve();
        },
        returning(fields: Record<string, unknown>) {
          // For jobs insert
          const jobs = builder._values as Job[];
          for (const j of jobs) {
            const newJob = { ...j, id: `job-${Math.random()}` };
            state.jobs.push(newJob as Job);
            return Promise.resolve([newJob]);
          }
          return Promise.resolve([{ id: `job-${Math.random()}` }]);
        },
      };
      return builder;
    }),
    select: vi.fn(() => {
      const builder = {
        _distinct: false,
        _fields: {},
        from(t: unknown) { return builder; },
        innerJoin(t: unknown, cond: unknown) { return builder; },
        where(cond: unknown) { return builder; },
        then(resolve: Function) {
          return Promise.resolve().then(() => resolve(state.users));
        },
      };
      return builder;
    }),
    selectDistinct: vi.fn((fields: unknown) => {
      const builder = {
        from(t: unknown) { return builder; },
        innerJoin(t: unknown, cond: unknown) { return builder; },
        then(resolve: Function) {
          return Promise.resolve().then(() => resolve(state.users));
        },
      };
      return builder;
    }),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
    execute: vi.fn(() => Promise.resolve()),
    // Expose state for assertions
    _state: state,
  };

  return db;
}

const makeTrendingItem = (categoryId: number) => ({
  youtubeVideoId: `v-${categoryId}`,
  title: `타이틀${categoryId}`,
  description: "설명",
  categoryId,
  channelTitle: "ch",
  viewCount: 1000,
  publishedAt: undefined,
});

describe("handleIngestTrends", () => {
  beforeEach(() => {
    vi.mocked(getTrendingVideos).mockReset();
    vi.mocked(fetchDailyTrends).mockReset();
  });

  it("happy path: inserts snapshots, marks run success, chains precompute", async () => {
    const runId = "run-001";
    const db = makeMockDb({
      runs: { [runId]: { id: runId, status: "pending" } },
      snapshots: [],
      jobs: [],
      users: [{ userId: "user-1" }],
    });

    vi.mocked(getTrendingVideos).mockImplementation(async ({ categoryId }) => [
      makeTrendingItem(categoryId),
    ]);
    vi.mocked(fetchDailyTrends).mockResolvedValue([
      { keyword: "구글키워드", score: 80 },
    ]);

    const fakeJob = {
      data: { payload: { ingestionRunId: runId, regionCode: "KR" } },
    } as any;
    await handleIngestTrends(fakeJob, db as any);

    const run = db._state.runs[runId];
    expect(run.status).toBe("success");
    expect(db._state.snapshots.length).toBeGreaterThan(0);
    const haYoutube = db._state.snapshots.some((s) => s.source === "youtube");
    const hasGoogle = db._state.snapshots.some((s) => s.source === "google-trends");
    expect(haYoutube).toBe(true);
    expect(hasGoogle).toBe(true);
    expect(db._state.jobs.some((j) => j.type === "precompute-gap-rationales")).toBe(true);
  });

  it("partial: Google Trends returns [] → run status = partial, no throw", async () => {
    const runId = "run-002";
    const db = makeMockDb({
      runs: { [runId]: { id: runId, status: "pending" } },
      snapshots: [],
      jobs: [],
      users: [{ userId: "user-1" }],
    });

    vi.mocked(getTrendingVideos).mockResolvedValue([makeTrendingItem(24)]);
    vi.mocked(fetchDailyTrends).mockResolvedValue([]);

    const fakeJob = {
      data: { payload: { ingestionRunId: runId, regionCode: "KR" } },
    } as any;
    await handleIngestTrends(fakeJob, db as any);

    const run = db._state.runs[runId];
    expect(run.status).toBe("partial");
    expect(run.partialCount).toBeGreaterThan(0);
  });

  it("partial: Google Trends throws → run still completes (non-fatal rule 12)", async () => {
    const runId = "run-003";
    const db = makeMockDb({
      runs: { [runId]: { id: runId, status: "pending" } },
      snapshots: [],
      jobs: [],
      users: [{ userId: "user-1" }],
    });

    vi.mocked(getTrendingVideos).mockResolvedValue([makeTrendingItem(24)]);
    vi.mocked(fetchDailyTrends).mockRejectedValue(new Error("boom"));

    const fakeJob = {
      data: { payload: { ingestionRunId: runId, regionCode: "KR" } },
    } as any;
    await expect(handleIngestTrends(fakeJob, db as any)).resolves.toBeUndefined();

    const run = db._state.runs[runId];
    expect(run.status).toBe("partial");
  });

  it("idempotent: second run with same data does not add duplicate snapshots", async () => {
    const runId = "run-004";
    const db = makeMockDb({
      runs: { [runId]: { id: runId, status: "pending" } },
      snapshots: [],
      jobs: [],
      users: [{ userId: "user-1" }],
    });

    const singleItem = makeTrendingItem(24);
    // Override title so keyword extraction gives a known keyword
    singleItem.title = "동일키워드 테스트";
    vi.mocked(getTrendingVideos).mockResolvedValue([singleItem]);
    vi.mocked(fetchDailyTrends).mockResolvedValue([]);

    const fakeJob = {
      data: { payload: { ingestionRunId: runId, regionCode: "KR" } },
    } as any;

    await handleIngestTrends(fakeJob, db as any);
    const firstCount = db._state.snapshots.length;

    // Second call — same data, run status already updated
    await handleIngestTrends(fakeJob, db as any);
    const secondCount = db._state.snapshots.length;
    expect(secondCount).toBe(firstCount);
  });
});
