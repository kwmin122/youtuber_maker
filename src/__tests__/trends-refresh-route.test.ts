/**
 * Phase 9 plan 09-03 — unit tests for POST /api/trends/refresh
 *
 * Uses mocked DB + queue + session following the project's test pattern.
 * Covers: session gating (401), first call (202), second call same user (429),
 * separate users rate-limited independently (both 202).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { __resetRateLimitForTest } from "@/lib/trends/rate-limit";

// --- Mock modules BEFORE importing the route ---

const queueAdd = vi.fn();
vi.mock("@/lib/queue", () => ({
  getQueue: () => ({ add: queueAdd }),
}));

const mockSession = vi.fn();
vi.mock("@/lib/auth/get-session", () => ({
  getServerSession: () => mockSession(),
}));

// Mock DB: insert().values().returning() returns a row with a generated id
const mockReturning = vi.fn(async () => [{ id: "run-manual-uuid" }]);
vi.mock("@/lib/db", () => {
  const insertChain = {
    values: vi.fn(() => insertChain),
    returning: (...args: unknown[]) => mockReturning(...args),
  };
  return {
    db: {
      insert: vi.fn(() => insertChain),
    },
  };
});

// Mock drizzle schema — route only uses trendIngestionRuns.id
vi.mock("@/lib/db/schema", () => ({
  trendIngestionRuns: { id: "id" },
}));

import { POST } from "@/app/api/trends/refresh/route";

describe("POST /api/trends/refresh", () => {
  beforeEach(() => {
    queueAdd.mockReset();
    mockReturning.mockReset();
    mockReturning.mockResolvedValue([{ id: "run-manual-uuid" }]);
    __resetRateLimitForTest();
    mockSession.mockReset();
  });

  it("401 when no session", async () => {
    mockSession.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("202 on first call for a user, inserts run, enqueues", async () => {
    mockSession.mockResolvedValue({ user: { id: "user-refresh-1" } });
    const res = await POST();
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.source).toBe("manual-admin");
    expect(typeof body.ingestionRunId).toBe("string");
    expect(queueAdd).toHaveBeenCalledTimes(1);
  });

  it("429 on second call within 60s for the same user", async () => {
    mockSession.mockResolvedValue({ user: { id: "user-refresh-2" } });
    const first = await POST();
    expect(first.status).toBe(202);
    const second = await POST();
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
    expect(queueAdd).toHaveBeenCalledTimes(1); // only the first enqueued
  });

  it("separate users are rate-limited independently", async () => {
    mockSession.mockResolvedValue({ user: { id: "user-refresh-3" } });
    const a = await POST();
    expect(a.status).toBe(202);
    mockSession.mockResolvedValue({ user: { id: "user-refresh-4" } });
    const b = await POST();
    expect(b.status).toBe(202);
    expect(queueAdd).toHaveBeenCalledTimes(2);
  });
});
