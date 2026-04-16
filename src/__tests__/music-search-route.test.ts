/**
 * Phase 10 plan 10-01 — unit tests for GET /api/music/search
 *
 * Covers: 401 (no session), 400 (missing q and genre), 502 (Pixabay error),
 * 200 (success with normalized tracks), genre-only URL passes music_genre param.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mock modules BEFORE importing the route ---

const mockSession = vi.fn();
vi.mock("@/lib/auth/get-session", () => ({
  getServerSession: () => mockSession(),
}));

vi.mock("@/lib/env", () => ({
  env: { PIXABAY_API_KEY: "test-key" },
}));

// Import AFTER mocks
import { GET } from "@/app/api/music/search/route";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/music/search");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

describe("GET /api/music/search", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSession.mockReset();
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  it("returns 401 when no session", async () => {
    mockSession.mockResolvedValue(null);

    const res = await GET(makeRequest({ q: "lofi" }));

    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 400 when q and genre are both absent", async () => {
    mockSession.mockResolvedValue({ user: { id: "user-1" } });

    const res = await GET(makeRequest());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("'q' or 'genre'");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 502 when Pixabay responds with non-OK status", async () => {
    mockSession.mockResolvedValue({ user: { id: "user-1" } });
    fetchSpy.mockResolvedValue({ ok: false, status: 429 });

    const res = await GET(makeRequest({ q: "lofi" }));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Pixabay API error");
  });

  it("returns 200 with normalized tracks on success", async () => {
    mockSession.mockResolvedValue({ user: { id: "user-1" } });
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [
          {
            id: 1,
            tags: "lofi, chill",
            audio: "https://cdn.pixabay.com/audio/test.mp3",
            duration: 120,
            user: "Artist",
          },
        ],
      }),
    });

    const res = await GET(makeRequest({ q: "lofi" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tracks).toHaveLength(1);
    expect(body.tracks[0]).toEqual({
      id: 1,
      title: "lofi, chill",
      artist: "Artist",
      url: "https://cdn.pixabay.com/audio/test.mp3",
      previewUrl: "https://cdn.pixabay.com/audio/test.mp3",
      duration: 120,
    });
  });

  it("genre-only search passes music_genre param to Pixabay", async () => {
    mockSession.mockResolvedValue({ user: { id: "user-1" } });
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ hits: [] }),
    });

    const res = await GET(makeRequest({ genre: "jazz" }));

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const calledUrl: string = fetchSpy.mock.calls[0][0];
    expect(calledUrl).toContain("music_genre=jazz");
    expect(calledUrl).not.toMatch(/[?&]q=/);
  });
});
