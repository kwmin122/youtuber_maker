/**
 * Regression test for Codex Retry-2 NEW-HIGH finding:
 * No duplicate-enqueue protection at the scene level in /api/jobs POST.
 *
 * Server must reject a second POST for the same sceneId when a
 * pending/active generate-avatar-lipsync job already exists for that
 * scene+user. Completed/failed jobs must allow a re-run.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock deps BEFORE importing the route ────────────────────────────────────

const getServerSessionMock = vi.fn();
vi.mock("@/lib/auth/get-session", () => ({
  getServerSession: () => getServerSessionMock(),
}));

vi.mock("@/lib/db/schema", () => ({
  longformSources: { __sentinel: "longformSources", id: "id", userId: "userId" },
  jobs: { __sentinel: "jobs", payload: "payload", status: "status", userId: "userId", type: "type" },
  scenes: { __sentinel: "scenes", id: "id", scriptId: "scriptId" },
  scripts: { __sentinel: "scripts", id: "id", projectId: "projectId" },
  projects: { __sentinel: "projects", id: "id", userId: "userId" },
}));

// Shared mutable state for controlling mock returns per query.
// We need to distinguish between:
//   1. Ownership check (scenes → scripts → projects chain) — returns ownerRow
//   2. Dedupe check (jobs table) — returns existingJob or []
const ownerRowRef = vi.hoisted(() => ({ value: null as { userId: string } | null }));
// Controls whether the dedupe query finds an existing job
const existingJobRef = vi.hoisted(() => ({ value: null as { id: string } | null }));

vi.mock("@/lib/db", () => {
  let fromSentinel = "";
  let hasLeftJoin = false;

  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn((...args: unknown[]) => {
    const table = args[0] as { __sentinel?: string };
    fromSentinel = table?.__sentinel ?? "";
    hasLeftJoin = false;
    return chain;
  });
  chain.leftJoin = vi.fn(() => {
    hasLeftJoin = true;
    return chain;
  });
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(async () => {
    // Ownership check uses leftJoin (scenes → scripts → projects)
    if (fromSentinel === "scenes" && hasLeftJoin) {
      return ownerRowRef.value ? [ownerRowRef.value] : [];
    }
    // Dedupe check queries jobs table directly (no leftJoin)
    if (fromSentinel === "jobs") {
      return existingJobRef.value ? [existingJobRef.value] : [];
    }
    return [];
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
  inArray: (...args: unknown[]) => ({ __inArray: args }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: { strings: Array.from(strings), values },
    }),
    { empty: { __sql: "empty" } }
  ),
}));

import { POST } from "@/app/api/jobs/route";

function mockRequest(body: unknown) {
  return {
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
}

const SCENE_ID = "00000000-0000-0000-0000-000000000001";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/jobs — scene-level duplicate-enqueue protection (Codex Retry-2 NEW-HIGH)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ownerRowRef.value = null;
    existingJobRef.value = null;
    // Default: caller owns the scene
    getServerSessionMock.mockResolvedValue({ user: { id: "owner" } });
    ownerRowRef.value = { userId: "owner" };
  });

  it("Case 1 — first POST for a scene creates the job → 201", async () => {
    // No existing pending/active job
    existingJobRef.value = null;

    const res = await POST(
      mockRequest({
        type: "generate-avatar-lipsync",
        payload: { sceneId: SCENE_ID, avatarPresetId: "preset-1" },
      })
    );

    expect(res.status).toBe(201);
    expect(addMock).toHaveBeenCalledOnce();
  });

  it("Case 2 — second POST for same scene while first is pending → 409 already_enqueued", async () => {
    // An existing pending job exists
    existingJobRef.value = { id: "existing-job-id" };

    const res = await POST(
      mockRequest({
        type: "generate-avatar-lipsync",
        payload: { sceneId: SCENE_ID, avatarPresetId: "preset-1" },
      })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("already_enqueued");
    expect(body.existingJobId).toBe("existing-job-id");
    // BullMQ must NOT be called — no double-enqueue
    expect(addMock).not.toHaveBeenCalled();
  });

  it("Case 3 — POST for same scene after first job is completed → 201 (regenerate allowed)", async () => {
    // No pending/active job — the completed job is NOT in the result
    // (query filters status IN ('pending','active'), completed rows excluded)
    existingJobRef.value = null;

    const res = await POST(
      mockRequest({
        type: "generate-avatar-lipsync",
        payload: { sceneId: SCENE_ID, avatarPresetId: "preset-1", regenerate: true },
      })
    );

    expect(res.status).toBe(201);
    expect(addMock).toHaveBeenCalledOnce();
  });

  it("Case 4 — POST for a DIFFERENT scene of same project → 201 (scene-level scoped)", async () => {
    // The existing job is for a different scene — the mock returns no match
    // because the dedupe query filters by sceneId (modeled here as no result)
    existingJobRef.value = null;
    const differentSceneId = "00000000-0000-0000-0000-000000000002";

    const res = await POST(
      mockRequest({
        type: "generate-avatar-lipsync",
        payload: { sceneId: differentSceneId, avatarPresetId: "preset-1" },
      })
    );

    expect(res.status).toBe(201);
    expect(addMock).toHaveBeenCalledOnce();
  });
});
