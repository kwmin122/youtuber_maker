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

  if (q.length > 200) {
    return NextResponse.json(
      { error: "query parameter 'q' exceeds maximum length of 200 characters" },
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
  } catch {
    // Do not include error details — they can contain the Pixabay API key URL
    return NextResponse.json(
      { error: "Pixabay API unreachable" },
      { status: 502 }
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: "Pixabay API error", status: response.status },
      { status: 502 }
    );
  }

  let data: { hits?: unknown };
  try {
    data = (await response.json()) as { hits?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Pixabay API returned invalid response" },
      { status: 502 }
    );
  }

  if (!Array.isArray(data.hits)) {
    return NextResponse.json({ tracks: [] });
  }

  const tracks: PixabayTrack[] = (data.hits as PixabayHit[]).map((h: PixabayHit) => ({
    id: h.id,
    title: h.tags,
    artist: h.user,
    url: h.audio,
    previewUrl: h.audio,
    duration: h.duration,
  }));

  return NextResponse.json({ tracks });
}
