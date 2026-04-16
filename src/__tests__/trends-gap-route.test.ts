/**
 * Phase 9 plan 09-04 — unit tests for GET /api/trends/gap
 *
 * Uses mocked DB + session following the project's test pattern.
 * Covers: 401 (no session), 403 (IDOR), happy path, cache-hit, no benchmarks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mock modules BEFORE importing the route ---

const mockSession = vi.fn();
vi.mock("@/lib/auth/get-session", () => ({
  getServerSession: () => mockSession(),
}));

// We intercept `await db...` calls at the point the chain is awaited.
// The route uses two patterns:
//   (a) .select()...limit(1)  — awaited via limit
//   (b) .select()...where()   — awaited directly (no limit)
//
// Strategy: mock `db` as an object whose `select` returns a thenable
// chain. Each call to `select()` dequeues the next response.
const dbResponses = vi.hoisted(() => ({
  queue: [] as unknown[][],
  shift(): unknown[] {
    return this.queue.length > 0 ? (this.queue.shift() ?? []) : [];
  },
}));

vi.mock("@/lib/db", () => {
  function makeThenableChain(resolvedWith: unknown[]) {
    let _resolvedWith = resolvedWith;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      // Make chain awaitable (thenable)
      then(onfulfilled?: unknown, _onrejected?: unknown) {
        return Promise.resolve(_resolvedWith).then(onfulfilled as never);
      },
      catch(onrejected: unknown) {
        return Promise.resolve(_resolvedWith).catch(onrejected as never);
      },
      finally(onfinally: unknown) {
        return Promise.resolve(_resolvedWith).finally(onfinally as never);
      },
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(async () => {
        // limit overrides the resolved value by dequeuing next result
        _resolvedWith = dbResponses.shift();
        return _resolvedWith;
      }),
    };
    return chain;
  }

  return {
    db: {
      select: vi.fn(() => {
        const result = dbResponses.shift();
        return makeThenableChain(result);
      }),
      insert: vi.fn(() => {
        const insertChain: Record<string, unknown> = {};
        insertChain.values = vi.fn(() => insertChain);
        insertChain.onConflictDoUpdate = vi.fn(async () => []);
        return insertChain;
      }),
    },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => `eq`),
  and: vi.fn((...args: unknown[]) => `and`),
  desc: vi.fn((a: unknown) => `desc`),
}));

import { GET } from "@/app/api/trends/gap/route";

// Valid UUID v4 format (zod validates version bits)
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

function makeRequest(projectId: string) {
  return new NextRequest(
    `http://localhost/api/trends/gap?projectId=${projectId}`
  );
}

describe("GET /api/trends/gap", () => {
  beforeEach(() => {
    mockSession.mockReset();
    dbResponses.queue = [];
  });

  it("returns 401 when no session", async () => {
    mockSession.mockResolvedValue(null);
    const res = await GET(makeRequest(VALID_UUID));
    expect(res.status).toBe(401);
  });

  it("returns 403 on cross-user projectId (IDOR)", async () => {
    mockSession.mockResolvedValue({ user: { id: "user-b" } });
    // Route: db.select().from(projects).where().limit(1)
    //   -> select() consumes [] (initial), limit() consumes project row
    dbResponses.queue = [
      [],                                          // initial select() result (unused: limit overrides)
      [{ id: VALID_UUID, userId: "user-a" }],     // limit(1) result — project belongs to user-a
    ];
    const res = await GET(makeRequest(VALID_UUID));
    expect(res.status).toBe(403);
  });

  it("returns empty + reason when no benchmark channels", async () => {
    mockSession.mockResolvedValue({ user: { id: "user-a" } });
    dbResponses.queue = [
      [],                                          // select() for project query
      [{ id: VALID_UUID, userId: "user-a" }],     // limit(1) -> project row
      [],                                          // select() for benchmarks -> resolves to [] (where-terminal)
    ];
    const res = await GET(makeRequest(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keywords).toEqual([]);
    expect(body.reason).toBe("no_benchmark_channels");
  });

  it("happy path: returns gap keywords excluding benchmark tokens", async () => {
    mockSession.mockResolvedValue({ user: { id: "user-a" } });
    dbResponses.queue = [
      // 1. project select() + limit(1)
      [],
      [{ id: VALID_UUID, userId: "user-a" }],
      // 2. benchmarks select() + where() (no limit)
      [{ channelId: "ch-1", title: "요리 채널", description: "매일 레시피 공유" }],
      // 3. latest snapshot select() + limit(1)
      [],
      [{ recordedAt: new Date("2026-04-16T00:00:00Z") }],
      // 4. cache probe select() + limit(1)
      [],
      [],                                          // cache miss
      // 5. snapshot rows select() + limit(SNAPSHOT_WINDOW)
      [],
      [
        { keyword: "게임", categoryId: 20, rank: 1, source: "youtube" },
        { keyword: "요리", categoryId: 26, rank: 2, source: "youtube" },
        { keyword: "댄스", categoryId: 24, rank: 3, source: "youtube" },
      ],
    ];
    const res = await GET(makeRequest(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    const kws = (body.keywords as Array<{ keyword: string }>).map((k) => k.keyword);
    expect(kws).toContain("게임");
    expect(kws).toContain("댄스");
    // "요리" token is in benchmark "요리 채널" title → excluded
    expect(kws).not.toContain("요리");
    expect(body.hitCache).toBe(false);
  });

  it("cache hit: returns hitCache=true when valid cache exists", async () => {
    mockSession.mockResolvedValue({ user: { id: "user-a" } });
    dbResponses.queue = [
      // project check
      [], [{ id: VALID_UUID, userId: "user-a" }],
      // benchmarks
      [{ channelId: "ch-1", title: "뷰티 채널", description: null }],
      // latest snapshot
      [], [{ recordedAt: new Date("2026-04-16T00:00:00Z") }],
      // cache probe — returns valid cache row
      [],
      [
        {
          setdiffCache: {
            keywords: [
              { keyword: "게임", categoryId: 20, rank: 1, source: "youtube" },
            ],
          },
          rationaleCache: null,
          ttlExpiresAt: new Date(Date.now() + 60_000),
        },
      ],
    ];
    const res = await GET(makeRequest(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hitCache).toBe(true);
    expect(body.keywords).toHaveLength(1);
    expect(body.keywords[0].keyword).toBe("게임");
  });
});
