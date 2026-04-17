/**
 * Phase 9 plan 09-02 — unit tests for handlePrecomputeGapRationales
 *
 * Uses mocked DB + mocked getUserAIClient. Covers:
 * - happy path: computes gap, calls Gemini, upserts rationale_cache
 * - skip gracefully when user has no benchmark channels
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/get-user-ai-client", () => ({
  getUserAIClient: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  env: {
    MASTER_ENCRYPTION_KEY: "test-key-32-chars-exactly-ok00000",
    BETTER_AUTH_SECRET: "test-secret",
  },
}));

import { getUserAIClient } from "@/lib/ai/get-user-ai-client";
import { handlePrecomputeGapRationales } from "@/worker/handlers/precompute-gap-rationales";

const TEST_USER_ID = "test-user-precompute";
const TEST_JOB_ID = "job-precompute-001";

// ------ In-memory DB builder ------

type JobRecord = {
  id: string;
  status: string;
  progress: number;
  result?: Record<string, unknown> | null;
  errorMessage?: string | null;
  updatedAt?: Date;
};

type GapAnalysisRecord = {
  id: string;
  userId: string;
  channelSetHash: string;
  latestSnapshotDate: string;
  setdiffCache: unknown;
  rationaleCache: Record<string, unknown>;
  computedAt: Date;
  ttlExpiresAt: Date;
};

function makeMockDb({
  channelRows,
  snapshotRows,
  hasBenchmarkChannels = true,
}: {
  channelRows: Array<{ channelId: string; title: string; description: string | null }>;
  snapshotRows: Array<{
    keyword: string;
    categoryId: number;
    rank: number;
    source: string;
    recordedAt: Date;
  }>;
  hasBenchmarkChannels?: boolean;
}) {
  const state = {
    jobs: {
      [TEST_JOB_ID]: {
        id: TEST_JOB_ID,
        status: "pending",
        progress: 0,
        result: null,
        errorMessage: null,
      } as JobRecord,
    },
    gapAnalyses: [] as GapAnalysisRecord[],
    jobEvents: [] as unknown[],
  };

  let selectCallCount = 0;

  const db = {
    update: vi.fn(() => {
      const builder = {
        _set: {} as Record<string, unknown>,
        set(values: Record<string, unknown>) {
          builder._set = values;
          return builder;
        },
        where(cond: unknown) {
          // Apply update to the job
          if (state.jobs[TEST_JOB_ID]) {
            Object.assign(state.jobs[TEST_JOB_ID], builder._set);
          }
          return Promise.resolve();
        },
      };
      return builder;
    }),
    insert: vi.fn(() => {
      const builder = {
        _values: [] as unknown[],
        values(v: unknown) {
          builder._values = Array.isArray(v) ? v : [v];
          return builder;
        },
        onConflictDoUpdate(opts: unknown) {
          // Upsert gap analysis
          const val = builder._values[0] as GapAnalysisRecord;
          const existing = state.gapAnalyses.find(
            (g) =>
              g.userId === val.userId &&
              g.channelSetHash === val.channelSetHash &&
              g.latestSnapshotDate === val.latestSnapshotDate
          );
          if (existing) {
            Object.assign(existing, val);
          } else {
            state.gapAnalyses.push({ ...val, id: `gap-${Math.random()}` });
          }
          return Promise.resolve([]);
        },
        then(resolve: Function, reject?: Function) {
          // For jobEvents insert
          for (const v of builder._values) {
            state.jobEvents.push(v);
          }
          return Promise.resolve().then(() => resolve(undefined));
        },
      };
      return builder;
    }),
    select: vi.fn(() => {
      selectCallCount++;
      const callNum = selectCallCount;
      // Data to return when this select resolves
      const resolveData = () => {
        if (callNum === 1) {
          return hasBenchmarkChannels ? channelRows : [];
        }
        return snapshotRows;
      };
      const builder: Record<string, unknown> = {};
      const chainFn = () => builder;
      builder.from = chainFn;
      builder.innerJoin = chainFn;
      builder.where = chainFn;
      builder.orderBy = chainFn;
      builder.limit = (_n: number) => Promise.resolve(resolveData());
      // Make builder thenable so `await db.select(...).from(...).where(...)` works
      builder.then = (resolve: Function, reject?: Function) =>
        Promise.resolve(resolveData()).then(resolve as any, reject as any);
      return builder;
    }),
    execute: vi.fn(() => Promise.resolve()),
    _state: state,
  };

  return db;
}

describe("handlePrecomputeGapRationales", () => {
  beforeEach(() => {
    vi.mocked(getUserAIClient).mockReset();
  });

  it("computes gap, calls Gemini, upserts rationale_cache", async () => {
    const db = makeMockDb({
      channelRows: [
        { channelId: "ch-1", title: "요리채널", description: "매일 레시피" },
      ],
      snapshotRows: [
        {
          keyword: "게임",
          categoryId: 24,
          rank: 1,
          source: "youtube",
          recordedAt: new Date("2026-04-16"),
        },
        {
          keyword: "요리",
          categoryId: 24,
          rank: 2,
          source: "youtube",
          recordedAt: new Date("2026-04-16"),
        },
      ],
    });

    vi.mocked(getUserAIClient).mockResolvedValue({
      provider: {
        name: "gemini",
        generateText: vi.fn().mockResolvedValue(
          JSON.stringify({
            items: [
              {
                keyword: "게임",
                rationale: "요리 채널에서 다루지 않는 영역",
                suggestedAngle: "게이머 요리 레시피",
              },
            ],
          })
        ),
      } as any,
      keyId: "key-1",
    });

    const fakeJob = {
      data: { jobId: TEST_JOB_ID, payload: { userId: TEST_USER_ID } },
    } as any;

    await handlePrecomputeGapRationales(fakeJob, db as any);

    expect(db._state.gapAnalyses).toHaveLength(1);
    const cache = db._state.gapAnalyses[0].rationaleCache as Record<string, unknown>;
    expect(Object.keys(cache)).toContain("게임");
    const job = db._state.jobs[TEST_JOB_ID];
    expect(job.status).toBe("completed");
    expect(job.progress).toBe(100);
  });

  it("skips gracefully when user has no benchmark channels", async () => {
    const db = makeMockDb({
      channelRows: [],
      snapshotRows: [],
      hasBenchmarkChannels: false,
    });

    const fakeJob = {
      data: { jobId: TEST_JOB_ID, payload: { userId: TEST_USER_ID } },
    } as any;
    await handlePrecomputeGapRationales(fakeJob, db as any);

    const job = db._state.jobs[TEST_JOB_ID];
    expect(job.status).toBe("completed");
    // No gap analyses should be written
    expect(db._state.gapAnalyses).toHaveLength(0);
  });
});
