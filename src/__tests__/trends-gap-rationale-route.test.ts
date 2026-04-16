/**
 * Phase 9 plan 09-04 — unit tests for POST /api/trends/gap/rationale
 *
 * Uses mocked DB + session + AI client following the project's test pattern.
 * Covers: 401 (no session), 403 (IDOR), cache-miss (fires Gemini + writes cache),
 * cache-hit (returns cached, does NOT call Gemini).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mock modules BEFORE importing the route ---

const mockSession = vi.fn();
vi.mock("@/lib/auth/get-session", () => ({
  getServerSession: () => mockSession(),
}));

const mockAIClient = vi.fn();
vi.mock("@/lib/ai/get-user-ai-client", () => ({
  getUserAIClient: () => mockAIClient(),
}));

// DB response queue (same pattern as trends-gap-route tests)
const dbResponses = vi.hoisted(() => ({
  queue: [] as unknown[][],
  shift(): unknown[] {
    return this.queue.length > 0 ? (this.queue.shift() ?? []) : [];
  },
}));

vi.mock("@/lib/db", () => {
  function makeThenableChain(resolvedWith: unknown[]) {
    let _resolvedWith = resolvedWith;

    const chain: Record<string, unknown> & PromiseLike<unknown[]> = {
      then(onfulfilled: (v: unknown[]) => unknown, _onrejected?: unknown) {
        return Promise.resolve(_resolvedWith).then(
          onfulfilled as (v: unknown) => unknown
        );
      },
      catch(onrejected: (e: unknown) => unknown) {
        return Promise.resolve(_resolvedWith).catch(onrejected);
      },
      finally(onfinally: () => void) {
        return Promise.resolve(_resolvedWith).finally(onfinally);
      },
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(async () => {
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

import { POST } from "@/app/api/trends/gap/rationale/route";

// Valid UUID v4 format
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/trends/gap/rationale", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/trends/gap/rationale", () => {
  beforeEach(() => {
    mockSession.mockReset();
    mockAIClient.mockReset();
    dbResponses.queue = [];
  });

  it("returns 401 without session", async () => {
    mockSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ keyword: "게임", projectId: VALID_UUID }));
    expect(res.status).toBe(401);
  });

  it("returns 403 on cross-user projectId (IDOR)", async () => {
    mockSession.mockResolvedValue({ user: { id: "user-b" } });
    // project belongs to user-a
    dbResponses.queue = [
      [],                                          // select() for project
      [{ id: VALID_UUID, userId: "user-a" }],     // limit(1) -> project row
    ];
    const res = await POST(makeRequest({ keyword: "게임", projectId: VALID_UUID }));
    expect(res.status).toBe(403);
  });

  it("cache miss: fires Gemini, writes rationale_cache, returns rationale", async () => {
    mockSession.mockResolvedValue({ user: { id: "user-a" } });

    // DB query sequence for the rationale route:
    // 1. project check: select() + limit(1)
    // 2. benchmarks: select() + where() (no limit)
    // 3. latest snapshot for keyword: select() + limit(1) (ordered by recordedAt desc)
    // 4. cache probe: select() + limit(1)
    dbResponses.queue = [
      // project check
      [], [{ id: VALID_UUID, userId: "user-a" }],
      // benchmarks (where-terminal)
      [{ channelId: "ch-1", title: "요리 채널" }],
      // latest snapshot for keyword "게임"
      [], [{ recordedAt: new Date("2026-04-16T00:00:00Z"), categoryId: 20 }],
      // cache probe — miss
      [], [],
    ];

    const generateText = vi.fn().mockResolvedValue(
      JSON.stringify({
        items: [
          {
            keyword: "게임",
            rationale: "요리 채널에 없는 영역이라 기회입니다",
            suggestedAngle: "게이머용 빠른 요리 레시피",
          },
        ],
      })
    );
    mockAIClient.mockResolvedValue({
      provider: { name: "gemini", generateText },
    });

    const res = await POST(makeRequest({ keyword: "게임", projectId: VALID_UUID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keyword).toBe("게임");
    expect(body.hitCache).toBe(false);
    expect(body.rationale).toContain("요리");
    expect(body.suggestedAngle).toBeTruthy();

    // Verify Gemini was called
    expect(generateText).toHaveBeenCalledOnce();
  });

  it("cache hit: second call returns hitCache=true without calling Gemini", async () => {
    mockSession.mockResolvedValue({ user: { id: "user-a" } });

    dbResponses.queue = [
      // project check
      [], [{ id: VALID_UUID, userId: "user-a" }],
      // benchmarks
      [{ channelId: "ch-1", title: "요리 채널" }],
      // latest snapshot
      [], [{ recordedAt: new Date("2026-04-16T00:00:00Z"), categoryId: 20 }],
      // cache probe — HIT
      [],
      [
        {
          rationaleCache: {
            게임: {
              rationale: "cached-rationale",
              suggestedAngle: "cached-angle",
              generatedAt: "2026-04-16T00:00:00.000Z",
            },
          },
          setdiffCache: null,
          channelSetHash: "abc",
          latestSnapshotDate: "2026-04-16",
          ttlExpiresAt: new Date(Date.now() + 60_000),
        },
      ],
    ];

    // Provide a mock that would throw if called — verifies cache prevents Gemini call
    const generateTextShouldNotBeCalled = vi.fn().mockRejectedValue(
      new Error("Gemini should not be called on cache hit")
    );
    mockAIClient.mockResolvedValue({
      provider: { name: "gemini", generateText: generateTextShouldNotBeCalled },
    });

    const res = await POST(makeRequest({ keyword: "게임", projectId: VALID_UUID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hitCache).toBe(true);
    expect(body.rationale).toBe("cached-rationale");
    expect(body.suggestedAngle).toBe("cached-angle");

    // Verify Gemini was NOT called
    expect(generateTextShouldNotBeCalled).not.toHaveBeenCalled();
  });
});
