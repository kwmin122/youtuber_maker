/**
 * Phase 7 retry 2, Codex CRITICAL-2 — IDOR guard on /api/jobs.
 *
 * The generic jobs endpoint attaches `session.user.id` to every new
 * job, but it does NOT verify that `payload.sourceId` (for longform-*
 * jobs) actually belongs to the caller. Without the guard, an
 * authenticated user could enqueue a longform-download or
 * longform-analyze or longform-clip against another user's source by
 * guessing the UUID, and the worker handler would happily mutate
 * that other user's row.
 *
 * These tests exercise the `POST` handler of `src/app/api/jobs/route.ts`
 * directly with mocked DB + session and assert 403 on cross-user and
 * 201 on same-user.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock deps BEFORE importing the route under test ---

const getServerSessionMock = vi.fn();
vi.mock("@/lib/auth/get-session", () => ({
  getServerSession: () => getServerSessionMock(),
}));

vi.mock("@/lib/db/schema", () => ({
  longformSources: {
    __sentinel: "longformSources",
    id: "id",
    userId: "userId",
  },
  jobs: { __sentinel: "jobs" },
}));

// Shared mutable state across db mock — use vi.hoisted so the vi.mock
// factory can reference it without the "top level variable" hoisting
// error that otherwise trips on the route's import-time evaluation.
const selectedSourceRef = vi.hoisted(
  () => ({ value: null as { userId: string } | null })
);

vi.mock("@/lib/db", () => {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(async () =>
    selectedSourceRef.value ? [selectedSourceRef.value] : []
  );
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn(async () => [{ id: "new-job-id" }]);
  return { db: chain };
});

// BullMQ queues — just capture calls.
const addMock = vi.fn(async () => undefined);
vi.mock("@/lib/queue", () => ({
  getQueue: () => ({ add: addMock }),
}));
vi.mock("@/lib/queue-longform", () => ({
  getLongformQueue: () => ({ add: addMock }),
}));

// Eq is used for the `where` clauses — we don't actually evaluate it.
vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => ({ __eq: args }),
  and: (...args: unknown[]) => ({ __and: args }),
  desc: (...args: unknown[]) => ({ __desc: args }),
}));

// Now import the route.
import { POST } from "@/app/api/jobs/route";

function mockRequest(body: unknown) {
  return {
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/jobs — longform IDOR guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedSourceRef.value = null;
  });

  it("returns 401 without a session", async () => {
    getServerSessionMock.mockResolvedValue(null);
    const res = await POST(
      mockRequest({ type: "longform-analyze", payload: { sourceId: "abc" } })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when a longform-* job has no sourceId", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(
      mockRequest({ type: "longform-download", payload: {} })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the referenced longform source does not exist", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectedSourceRef.value = null;
    const res = await POST(
      mockRequest({
        type: "longform-analyze",
        payload: { sourceId: "00000000-0000-0000-0000-000000000001" },
      })
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when an attacker enqueues longform-* against a victim's sourceId", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "attacker" } });
    selectedSourceRef.value = { userId: "victim" };
    const res = await POST(
      mockRequest({
        type: "longform-clip",
        payload: {
          sourceId: "00000000-0000-0000-0000-000000000002",
          candidateIds: ["c1"],
        },
      })
    );
    expect(res.status).toBe(403);
    expect(addMock).not.toHaveBeenCalled();
  });

  it("allows enqueue when the caller owns the referenced source", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectedSourceRef.value = { userId: "u1" };
    const res = await POST(
      mockRequest({
        type: "longform-analyze",
        payload: { sourceId: "00000000-0000-0000-0000-000000000003" },
      })
    );
    expect(res.status).toBe(201);
    expect(addMock).toHaveBeenCalledOnce();
  });
});
