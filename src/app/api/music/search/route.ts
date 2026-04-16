import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getServerSession } from "@/lib/auth/get-session";

export interface PixabayTrack {
  id: number;
  title: string;
  artist: string;
  url: string;
  previewUrl: string;
  duration: number;
}

interface PixabayHit {
  id: number;
  tags: string;
  audio: string;
  duration: number;
  user: string;
}

/** GET /api/music/search — server-side Pixabay Music proxy */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q") ?? "";
  const genre = searchParams.get("genre") ?? "";

  if (!q && !genre) {
    return NextResponse.json(
      { error: "query parameter 'q' or 'genre' is required" },
      { status: 400 }
    );
  }

  const params = new URLSearchParams({ key: env.PIXABAY_API_KEY, per_page: "20" });
  if (q) params.set("q", q);
  if (genre) params.set("music_genre", genre);
  const pixabayUrl = `https://pixabay.com/api/music/?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(pixabayUrl, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    return NextResponse.json(
      { error: "Pixabay API unreachable", details: String(err) },
      { status: 502 }
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: "Pixabay API error", status: response.status },
      { status: 502 }
    );
  }

  const data = (await response.json()) as { hits: PixabayHit[] };

  const tracks: PixabayTrack[] = data.hits.map((h: PixabayHit) => ({
    id: h.id,
    title: h.tags,
    artist: h.user,
    url: h.audio,
    previewUrl: h.audio,
    duration: h.duration,
  }));

  return NextResponse.json({ tracks });
}
