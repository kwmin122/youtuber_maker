import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";

// --- Hoisted mocks (declared before vi.mock factories are evaluated) ---

const { mockSession, mockUpload, mockDownload, mockStorageDelete } = vi.hoisted(() => ({
  mockSession: vi.fn(async () => ({ user: { id: "user-aaa", email: "a@test" } })),
  mockUpload: vi.fn(async () => ({
    storagePath: "user-aaa/fake-uuid.png",
    signedUrl: "https://signed.example/upload",
    token: "tok",
  })),
  mockDownload: vi.fn(async () => "https://signed.example/download"),
  mockStorageDelete: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/get-session", () => ({
  getServerSession: () => mockSession(),
}));

vi.mock("@/lib/media/avatar-reference-storage", () => ({
  createAvatarReferenceUploadUrl: mockUpload,
  createAvatarReferenceDownloadUrl: mockDownload,
  deleteAvatarReferenceObject: mockStorageDelete,
}));

// Mock global fetch for the hash verification path
global.fetch = vi.fn(async () => ({
  ok: true,
  arrayBuffer: async () => new TextEncoder().encode("fake-bytes").buffer,
})) as unknown as typeof fetch;

// Mock DB — using only vi.fn() in the factory to avoid hoisting issues
vi.mock("@/lib/db", () => {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockDbDelete = vi.fn();
  return {
    db: {
      select: mockSelect,
      insert: mockInsert,
      delete: mockDbDelete,
    },
  };
});

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

import { POST as postUploadUrl } from "@/app/api/avatar/assets/upload-url/route";
import { POST as postAsset, GET as getAssets } from "@/app/api/avatar/assets/route";
import { DELETE as deleteAsset } from "@/app/api/avatar/assets/[id]/route";
import { db } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb = db as any;

const FAKE_HASH = createHash("sha256").update("fake-bytes").digest("hex");

function req(body: unknown, url = "http://localhost/api/avatar/assets"): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function makeSelectReturning(rows: unknown[]) {
  return vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(rows)),
      })),
      limit: vi.fn(() => Promise.resolve(rows)),
    })),
  }));
}

function makeInsertReturning(row: unknown) {
  return vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve([row])),
    })),
  }));
}

function makeDelete() {
  return vi.fn(() => ({
    where: vi.fn(() => Promise.resolve()),
  }));
}

describe("POST /api/avatar/assets/upload-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "user-aaa", email: "a@test" } });
    mockUpload.mockResolvedValue({
      storagePath: "user-aaa/fake-uuid.png",
      signedUrl: "https://signed.example/upload",
      token: "tok",
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode("fake-bytes").buffer,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null as unknown as { user: { id: string; email: string } });
    const res = await postUploadUrl(req({ ext: "png" }));
    expect(res.status).toBe(401);
  });

  it("returns signed URL for authenticated caller", async () => {
    const res = await postUploadUrl(req({ ext: "png" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storagePath");
    expect(body).toHaveProperty("signedUrl");
  });

  it("returns 400 for invalid extension", async () => {
    const res = await postUploadUrl(req({ ext: "gif" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/avatar/assets (consent + dedupe + IDOR)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "user-aaa", email: "a@test" } });
    mockDownload.mockResolvedValue("https://signed.example/download");
    mockStorageDelete.mockResolvedValue(undefined);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode("fake-bytes").buffer,
    });
    // Default: no existing rows
    mockDb.select = makeSelectReturning([]);
    mockDb.insert = makeInsertReturning({
      id: "new-id",
      userId: "user-aaa",
      storagePath: "user-aaa/a.png",
      publicUrl: "supabase://avatar-references/user-aaa/a.png",
      imageHash: FAKE_HASH,
      consentRecordedAt: new Date(),
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockDb.delete = makeDelete();
  });

  it("rejects missing consent with 400", async () => {
    const res = await postAsset(
      req({
        storagePath: "user-aaa/a.png",
        imageHash: FAKE_HASH,
        consent: false,
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects storagePath not scoped to caller (IDOR guard)", async () => {
    const res = await postAsset(
      req({
        storagePath: "user-bbb/a.png",
        imageHash: FAKE_HASH,
        consent: true,
      })
    );
    expect(res.status).toBe(403);
  });

  it("rejects mismatched hash and deletes the rogue upload", async () => {
    const res = await postAsset(
      req({
        storagePath: "user-aaa/a.png",
        imageHash: "0".repeat(64),
        consent: true,
      })
    );
    expect(res.status).toBe(400);
    expect(mockStorageDelete).toHaveBeenCalled();
  });

  it("inserts a new row on first upload", async () => {
    const res = await postAsset(
      req({
        storagePath: "user-aaa/a.png",
        imageHash: FAKE_HASH,
        consent: true,
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.deduped).toBe(false);
  });

  it("dedupes a re-upload of the same hash", async () => {
    const existingRow = {
      id: "existing-id",
      userId: "user-aaa",
      storagePath: "user-aaa/a.png",
      publicUrl: "supabase://avatar-references/user-aaa/a.png",
      imageHash: FAKE_HASH,
      consentRecordedAt: new Date(),
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // Make select return the existing row for the dedupe check
    mockDb.select = makeSelectReturning([existingRow]);

    const res = await postAsset(
      req({ storagePath: "user-aaa/b.png", imageHash: FAKE_HASH, consent: true })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deduped).toBe(true);
  });
});

describe("DELETE /api/avatar/assets/[id] (ownership)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "user-aaa", email: "a@test" } });
    mockStorageDelete.mockResolvedValue(undefined);
    mockDb.delete = makeDelete();
  });

  it("returns 403 when deleting another user's row", async () => {
    const foreignRow = {
      id: "foreign-id",
      userId: "user-bbb",
      storagePath: "user-bbb/x.png",
      publicUrl: "supabase://avatar-references/user-bbb/x.png",
      imageHash: "1".repeat(64),
      consentRecordedAt: new Date(),
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.select = makeSelectReturning([foreignRow]);

    const res = await deleteAsset(
      new Request("http://localhost/api/avatar/assets/foreign-id"),
      { params: Promise.resolve({ id: "foreign-id" }) }
    );
    expect(res.status).toBe(403);
    // Storage should NOT be deleted
    expect(mockStorageDelete).not.toHaveBeenCalled();
  });

  it("happy path: deletes storage object then DB row", async () => {
    const ownRow = {
      id: "own-id",
      userId: "user-aaa",
      storagePath: "user-aaa/y.png",
      publicUrl: "supabase://avatar-references/user-aaa/y.png",
      imageHash: "2".repeat(64),
      consentRecordedAt: new Date(),
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.select = makeSelectReturning([ownRow]);

    const res = await deleteAsset(
      new Request("http://localhost/api/avatar/assets/own-id"),
      { params: Promise.resolve({ id: "own-id" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    // Storage delete called first (before DB delete)
    expect(mockStorageDelete).toHaveBeenCalledWith("user-aaa/y.png");
    // DB delete also called
    expect(mockDb.delete).toHaveBeenCalled();
  });
});

describe("GET /api/avatar/assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "user-aaa", email: "a@test" } });
    mockDb.select = makeSelectReturning([]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null as unknown as { user: { id: string; email: string } });
    const res = await getAssets();
    expect(res.status).toBe(401);
  });
});
