/**
 * Regression test for VERIFICATION.md HIGH H1:
 * "/api/jobs POST does not IDOR-check generate-avatar-lipsync."
 *
 * Any authenticated user could enqueue a generate-avatar-lipsync job
 * against another user's sceneId. The worker handler catches this later
 * (after the job row is created + BullMQ dispatched), violating
 * PLANS.md cross-cutting rule 4 ("BEFORE any DB mutation").
 *
 * These tests exercise POST /api/jobs directly with mocked DB + session
 * and assert 403 on cross-user, 400 on missing sceneId, 201 on same-user.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock deps BEFORE importing the route ────────────────────────────────────

const getServerSessionMock = vi.fn();
vi.mock("@/lib/auth/get-session", () => ({
  getServerSession: () => getServerSessionMock(),
}));

// We need to track which table the DB query is selecting from to return
// appropriate results for each IDOR check.
const ownerRowRef = vi.hoisted(
  () => ({ value: null as { userId: string } | null })
);
const longformOwnerRef = vi.hoisted(
  () => ({ value: null as { userId: string } | null })
);

vi.mock("@/lib/db/schema", () => ({
  longformSources: { __sentinel: "longformSources", id: "id", userId: "userId" },
  jobs: { __sentinel: "jobs" },
  scenes: { __sentinel: "scenes", id: "id", scriptId: "scriptId" },
  scripts: { __sentinel: "scripts", id: "id", projectId: "projectId" },
  projects: { __sentinel: "projects", id: "id", userId: "userId" },
}));

vi.mock("@/lib/db", () => {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};

  // Track which table the select is from by inspecting the from() argument.
  // If the sentinel is "scenes", we're doing the avatar IDOR check.
  // If it's "longformSources", it's the longform check.
  let fromSentinel = "";
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn((...args: unknown[]) => {
    const table = args[0] as { __sentinel?: string };
    fromSentinel = table?.__sentinel ?? "";
    return chain;
  });
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(async () => {
    if (fromSentinel === "scenes") {
      return ownerRowRef.value ? [ownerRowRef.value] : [];
    }
    return longformOwnerRef.value ? [longformOwnerRef.value] : [];
  });
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn(async () => [{ id: "new-job-id" }]);
  return { db: chain };
});

const addMock = vi.fn(async () => undefined);
vi.mock("@/lib/queue", () => ({
  getQueue: () => ({ add: addMock }),
}));
vi.mock("@/lib/queue-longform", () => ({
  getLongformQueue: () => ({ add: addMock }),
}));

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => ({ __eq: args }),
  and: (...args: unknown[]) => ({ __and: args }),
  desc: (...args: unknown[]) => ({ __desc: args }),
}));

import { POST } from "@/app/api/jobs/route";

function mockRequest(body: unknown) {
  return {
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/jobs — generate-avatar-lipsync IDOR guard (H1 regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ownerRowRef.value = null;
    longformOwnerRef.value = null;
  });

  it("returns 400 when sceneId is missing from payload", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(
      mockRequest({ type: "generate-avatar-lipsync", payload: {} })
    );
    expect(res.status).toBe(400);
    expect(addMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the referenced scene does not exist", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "u1" } });
    ownerRowRef.value = null; // scene not found
    const res = await POST(
      mockRequest({
        type: "generate-avatar-lipsync",
        payload: { sceneId: "00000000-0000-0000-0000-000000000001" },
      })
    );
    expect(res.status).toBe(404);
    expect(addMock).not.toHaveBeenCalled();
  });

  it("returns 403 when an attacker enqueues against a victim's sceneId", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "attacker" } });
    ownerRowRef.value = { userId: "victim" };
    const res = await POST(
      mockRequest({
        type: "generate-avatar-lipsync",
        payload: { sceneId: "00000000-0000-0000-0000-000000000002" },
      })
    );
    expect(res.status).toBe(403);
    expect(addMock).not.toHaveBeenCalled();
  });

  it("allows enqueue (201) when caller owns the scene", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "owner" } });
    ownerRowRef.value = { userId: "owner" };
    const res = await POST(
      mockRequest({
        type: "generate-avatar-lipsync",
        payload: { sceneId: "00000000-0000-0000-0000-000000000003" },
      })
    );
    expect(res.status).toBe(201);
    expect(addMock).toHaveBeenCalledOnce();
  });

  it("existing longform IDOR guard still works — 403 on cross-user", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "attacker" } });
    longformOwnerRef.value = { userId: "victim" };
    const res = await POST(
      mockRequest({
        type: "longform-analyze",
        payload: { sourceId: "00000000-0000-0000-0000-000000000004" },
      })
    );
    expect(res.status).toBe(403);
    expect(addMock).not.toHaveBeenCalled();
  });
});
