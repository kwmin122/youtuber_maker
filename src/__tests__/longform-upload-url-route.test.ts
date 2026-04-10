import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks must be hoisted before importing the route ---

const getSessionMock = vi.fn();
vi.mock("@/lib/auth/get-session", () => ({
  getServerSession: () => getSessionMock(),
}));

const createSignedUploadUrlMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  createSupabaseClient: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: createSignedUploadUrlMock,
      }),
    },
  }),
}));

import { POST } from "@/app/api/longform/sources/upload-url/route";

type AnyJson = Record<string, unknown>;

function makeRequest(body: unknown) {
  return {
    json: async () => body,
  } as unknown as import("next/server").NextRequest;
}

async function readJson(response: Response): Promise<AnyJson> {
  return (await response.json()) as AnyJson;
}

describe("POST /api/longform/sources/upload-url", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    createSignedUploadUrlMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 for a body with an invalid MIME type", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(
      makeRequest({
        filename: "video.mp4",
        contentType: "application/pdf",
        fileSize: 1024,
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when fileSize exceeds the 2 GB cap", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(
      makeRequest({
        filename: "video.mp4",
        contentType: "video/mp4",
        fileSize: 3 * 1024 * 1024 * 1024,
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns a signed URL scoped under <userId>/uploads/ on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    createSignedUploadUrlMock.mockResolvedValue({
      data: {
        token: "fake-token",
        signedUrl: "https://fake.supabase/signed",
      },
      error: null,
    });

    const res = await POST(
      makeRequest({
        filename: "weird name!@#.mp4",
        contentType: "video/mp4",
        fileSize: 1024 * 1024,
      })
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(typeof json.storagePath).toBe("string");
    expect(String(json.storagePath).startsWith("user-1/uploads/")).toBe(
      true
    );
    // Filename should have been sanitized (no spaces / special chars).
    expect(String(json.storagePath)).toMatch(/weird_name___\.mp4$/);
    expect(json.token).toBe("fake-token");
    expect(json.signedUrl).toBe("https://fake.supabase/signed");
  });

  it("returns 500 when Supabase signing fails", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    createSignedUploadUrlMock.mockResolvedValue({
      data: null,
      error: { message: "storage down" },
    });

    const res = await POST(
      makeRequest({
        filename: "video.mp4",
        contentType: "video/mp4",
        fileSize: 1024,
      })
    );
    expect(res.status).toBe(500);
  });
});
