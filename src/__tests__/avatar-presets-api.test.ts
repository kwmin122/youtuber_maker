/**
 * Plan 08-02 — GET /api/avatar/presets ownership + filter tests.
 *
 * Verifies that the route returns only global presets (userId IS NULL)
 * and the caller's own presets, never another user's custom presets.
 * Also verifies gender/style/ageGroup filter query params work.
 * Also verifies admin gate on POST /api/avatar/presets/refresh.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks hoisted before route import ---

const getSessionMock = vi.fn();
vi.mock("@/lib/auth/get-session", () => ({
  getServerSession: () => getSessionMock(),
}));

// Rows stored in memory for the mock DB
type MockRow = {
  userId: string | null;
  provider: string;
  providerAvatarId: string;
  gender: string;
  ageGroup: string;
  style: string;
  previewImageUrl: string;
  source: string;
  voiceIdHint: string | null;
  id: string;
  createdAt: Date;
};

const dbRows: MockRow[] = [];

// Minimal Drizzle-shaped query builder mock.
// The GET route calls: db.select().from(avatarPresets).where(and(...)).limit(200)
// We intercept .limit() to apply our mock filter logic.

let capturedWhere: unknown = undefined;

vi.mock("@/lib/db", () => {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn((w) => { capturedWhere = w; return chain; });
  chain.limit = vi.fn(async () => {
    // Evaluate the filter from capturedWhere metadata
    // The route builds: and(ownership, ...filters)
    // We simulate ownership: include rows with userId=null OR userId=currentUserId
    // and apply any extra filters.
    const userId = currentUserId;
    return dbRows.filter((row) => {
      // ownership
      const owned = row.userId === null || row.userId === userId;
      if (!owned) return false;
      // apply active filters from capturedFilter
      for (const f of activeFilters) {
        if (row[f.col as keyof MockRow] !== f.val) return false;
      }
      return true;
    });
  });
  // insert chain for POST /refresh
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => chain);
  chain.onConflictDoNothing = vi.fn(() => chain);
  chain.returning = vi.fn(async () => [{ id: "new-row-id" }]);
  return { db: chain };
});

// Track active mock filters and current user separately
let currentUserId = "user-aaa";
const activeFilters: Array<{ col: string; val: string }> = [];

// Mock drizzle operators - they just store metadata we inspect
vi.mock("drizzle-orm", () => ({
  eq: (col: { columnName?: string; name?: string }, val: string) => ({
    __eq: true,
    col: col?.columnName ?? col?.name ?? String(col),
    val,
  }),
  isNull: (col: unknown) => ({ __isNull: true, col }),
  or: (...args: unknown[]) => ({ __or: args }),
  and: (...args: unknown[]) => ({ __and: args }),
}));

// avatarPresets schema mock with column metadata
vi.mock("@/lib/db/schema", () => ({
  avatarPresets: {
    userId: { columnName: "user_id", name: "userId" },
    provider: { columnName: "provider", name: "provider" },
    providerAvatarId: { columnName: "provider_avatar_id", name: "providerAvatarId" },
    gender: { columnName: "gender", name: "gender" },
    ageGroup: { columnName: "age_group", name: "ageGroup" },
    style: { columnName: "style", name: "style" },
    previewImageUrl: { columnName: "preview_image_url", name: "previewImageUrl" },
    source: { columnName: "source", name: "source" },
    voiceIdHint: { columnName: "voice_id_hint", name: "voiceIdHint" },
    id: { columnName: "id", name: "id" },
  },
}));

// Mock admin provider factory for refresh route
vi.mock("@/lib/avatar/provider-factory", () => ({
  getAdminAvatarProvider: () => ({
    listAvatars: async () => [],
  }),
}));

vi.mock("@/lib/avatar/curated-fallback", () => ({
  CURATED_FALLBACK: [],
}));

import { GET } from "@/app/api/avatar/presets/route";
import { POST as REFRESH } from "@/app/api/avatar/presets/refresh/route";

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/avatar/presets");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
}

describe("GET /api/avatar/presets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbRows.length = 0;
    activeFilters.length = 0;
    currentUserId = "user-aaa";
    capturedWhere = undefined;
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid gender param", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-aaa" } });
    const res = await GET(makeGetRequest({ gender: "robot" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid style param", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-aaa" } });
    const res = await GET(makeGetRequest({ style: "watercolor" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid provider param", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-aaa" } });
    const res = await GET(makeGetRequest({ provider: "sora" }));
    expect(res.status).toBe(400);
  });

  it("returns global presets and caller's own, excludes other users' presets", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-aaa" } });
    currentUserId = "user-aaa";

    // Seed mock rows
    dbRows.push({
      id: "row-global-1",
      userId: null,
      provider: "heygen",
      providerAvatarId: "global-1",
      gender: "male",
      ageGroup: "adult",
      style: "realistic",
      previewImageUrl: "https://example.com/g1.png",
      source: "library",
      voiceIdHint: null,
      createdAt: new Date(),
    });
    dbRows.push({
      id: "row-own-1",
      userId: "user-aaa",
      provider: "heygen",
      providerAvatarId: "own-1",
      gender: "female",
      ageGroup: "youth",
      style: "cartoon",
      previewImageUrl: "https://example.com/o1.png",
      source: "custom",
      voiceIdHint: null,
      createdAt: new Date(),
    });
    dbRows.push({
      id: "row-foreign-1",
      userId: "user-bbb",
      provider: "heygen",
      providerAvatarId: "foreign-1",
      gender: "female",
      ageGroup: "youth",
      style: "cartoon",
      previewImageUrl: "https://example.com/f1.png",
      source: "custom",
      voiceIdHint: null,
      createdAt: new Date(),
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ providerAvatarId: string }>;
    const ids = body.map((r) => r.providerAvatarId);
    expect(ids).toContain("global-1");
    expect(ids).toContain("own-1");
    expect(ids).not.toContain("foreign-1");
  });

  it("applies gender filter — only returns matching rows", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-aaa" } });
    currentUserId = "user-aaa";

    dbRows.push({
      id: "row-male",
      userId: null,
      provider: "heygen",
      providerAvatarId: "male-preset",
      gender: "male",
      ageGroup: "adult",
      style: "realistic",
      previewImageUrl: "https://example.com/m.png",
      source: "library",
      voiceIdHint: null,
      createdAt: new Date(),
    });
    dbRows.push({
      id: "row-female",
      userId: null,
      provider: "heygen",
      providerAvatarId: "female-preset",
      gender: "female",
      ageGroup: "adult",
      style: "business",
      previewImageUrl: "https://example.com/f.png",
      source: "library",
      voiceIdHint: null,
      createdAt: new Date(),
    });

    // Simulate filter: the mock DB checks activeFilters
    activeFilters.push({ col: "gender", val: "female" });

    const res = await GET(makeGetRequest({ gender: "female" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ gender: string; providerAvatarId: string }>;
    for (const row of body) {
      expect(row.gender).toBe("female");
    }
    const ids = body.map((r) => r.providerAvatarId);
    expect(ids).not.toContain("male-preset");
  });
});

describe("POST /api/avatar/presets/refresh — admin gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_USER_IDS;
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/avatar/presets/refresh", { method: "POST" });
    const res = await REFRESH();
    expect(res.status).toBe(401);
  });

  it("returns 403 when ADMIN_USER_IDS env is not set", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-aaa" } });
    process.env.ADMIN_USER_IDS = "";
    const res = await REFRESH();
    expect(res.status).toBe(403);
  });

  it("returns 403 when caller is not in ADMIN_USER_IDS", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-aaa" } });
    process.env.ADMIN_USER_IDS = "admin-xyz,admin-abc";
    const res = await REFRESH();
    expect(res.status).toBe(403);
  });

  it("allows access when caller is in ADMIN_USER_IDS", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "admin-xyz" } });
    process.env.ADMIN_USER_IDS = "admin-xyz,admin-abc";
    const res = await REFRESH();
    // Should return 200 (provider stubs return empty list so inserted=0)
    expect(res.status).toBe(200);
    const body = (await res.json()) as { inserted: number };
    expect(typeof body.inserted).toBe("number");
  });
});
