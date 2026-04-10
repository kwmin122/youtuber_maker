/**
 * Phase 7 retry 2, Codex HIGH-3.
 *
 * `/api/projects/[id]/scenes` previously returned raw scene rows, so
 * longform child projects opened with an empty preview because the
 * VideoTab client expected top-level `mediaUrl` / `mediaType` /
 * `audioUrl` fields. This test mocks the Drizzle chain and asserts
 * the route now joins `media_assets` and enriches each scene.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const getSessionMock = vi.fn();
vi.mock("@/lib/auth/get-session", () => ({
  getServerSession: () => getSessionMock(),
}));

vi.mock("@/lib/db/schema", () => ({
  scenes: { __sentinel: "scenes", id: "id", scriptId: "scriptId" },
  scripts: {
    __sentinel: "scripts",
    projectId: "projectId",
    isSelected: "isSelected",
  },
  mediaAssets: {
    __sentinel: "mediaAssets",
    sceneId: "sceneId",
    status: "status",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (...a: unknown[]) => ({ __eq: a }),
  and: (...a: unknown[]) => ({ __and: a }),
  asc: (...a: unknown[]) => ({ __asc: a }),
  desc: (...a: unknown[]) => ({ __desc: a }),
  inArray: (...a: unknown[]) => ({ __inArray: a }),
}));

// Mutable script/scene/asset fixtures that each test case sets.
const fixtures = vi.hoisted(() => ({
  script: null as { id: string } | null,
  scenes: [] as Array<Record<string, unknown>>,
  assets: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/db", () => {
  // `db.select().from(scripts).where(...).limit(1)` returns script.
  // `db.select().from(scenes).where(...).orderBy(...)` returns scenes.
  // `db.select().from(mediaAssets).where(...).orderBy(...)` returns assets.
  function fromFactory(table: { __sentinel: string }) {
    const terminal = {
      where: () => terminal,
      limit: async (_n: number) =>
        table.__sentinel === "scripts" ? (fixtures.script ? [fixtures.script] : []) : [],
      orderBy: async () =>
        table.__sentinel === "scenes"
          ? fixtures.scenes
          : table.__sentinel === "mediaAssets"
            ? fixtures.assets
            : [],
    };
    return terminal;
  }
  return {
    db: {
      select: () => ({
        from: (t: { __sentinel: string }) => fromFactory(t),
      }),
    },
  };
});

import { GET } from "@/app/api/projects/[id]/scenes/route";

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/projects/[id]/scenes — media asset enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.script = null;
    fixtures.scenes = [];
    fixtures.assets = [];
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET({} as never, makeCtx("p1") as never);
    expect(res.status).toBe(401);
  });

  it("returns empty when no selected script exists", async () => {
    fixtures.script = null;
    const res = await GET({} as never, makeCtx("p1") as never);
    const json = await res.json();
    expect(json).toEqual({ scenes: [], scriptId: null });
  });

  it("enriches longform-clip scenes with mediaUrl + audioUrl from media_assets", async () => {
    fixtures.script = { id: "s1" };
    fixtures.scenes = [
      {
        id: "scene-1",
        sceneIndex: 0,
        narration: "hi",
        duration: 30,
        scriptId: "s1",
      },
    ];
    fixtures.assets = [
      // newest-first per the orderBy(desc(createdAt))
      {
        sceneId: "scene-1",
        type: "video",
        url: "https://cdn/clip.mp4",
        status: "completed",
      },
      {
        sceneId: "scene-1",
        type: "audio",
        url: "https://cdn/clip.mp4",
        status: "completed",
      },
    ];

    const res = await GET({} as never, makeCtx("p1") as never);
    const json = (await res.json()) as {
      scenes: Array<Record<string, unknown>>;
      scriptId: string;
    };
    expect(json.scriptId).toBe("s1");
    expect(json.scenes).toHaveLength(1);
    const s = json.scenes[0];
    expect(s.mediaUrl).toBe("https://cdn/clip.mp4");
    expect(s.mediaType).toBe("video");
    expect(s.audioUrl).toBe("https://cdn/clip.mp4");
  });

  it("prefers video asset over image when both exist, and picks audio separately", async () => {
    fixtures.script = { id: "s2" };
    fixtures.scenes = [
      { id: "scene-a", sceneIndex: 0, duration: 5, scriptId: "s2" },
    ];
    fixtures.assets = [
      {
        sceneId: "scene-a",
        type: "image",
        url: "https://cdn/img.png",
        status: "completed",
      },
      {
        sceneId: "scene-a",
        type: "video",
        url: "https://cdn/clip.mp4",
        status: "completed",
      },
      {
        sceneId: "scene-a",
        type: "audio",
        url: "https://cdn/voice.mp3",
        status: "completed",
      },
    ];

    const res = await GET({} as never, makeCtx("p2") as never);
    const json = (await res.json()) as {
      scenes: Array<Record<string, unknown>>;
    };
    expect(json.scenes[0].mediaUrl).toBe("https://cdn/clip.mp4");
    expect(json.scenes[0].mediaType).toBe("video");
    expect(json.scenes[0].audioUrl).toBe("https://cdn/voice.mp3");
  });

  it("falls back to legacy inline scene columns when no media_assets rows exist", async () => {
    fixtures.script = { id: "s3" };
    fixtures.scenes = [
      {
        id: "legacy-scene-1",
        sceneIndex: 0,
        duration: 5,
        scriptId: "s3",
        imageUrl: "https://cdn/legacy.png",
        audioUrl: "https://cdn/legacy.mp3",
      },
    ];
    fixtures.assets = [];

    const res = await GET({} as never, makeCtx("p3") as never);
    const json = (await res.json()) as {
      scenes: Array<Record<string, unknown>>;
    };
    expect(json.scenes[0].mediaUrl).toBe("https://cdn/legacy.png");
    expect(json.scenes[0].mediaType).toBe("image");
    expect(json.scenes[0].audioUrl).toBe("https://cdn/legacy.mp3");
  });
});
