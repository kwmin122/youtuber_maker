import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/get-session";
import { searchChannels } from "@/lib/youtube/client";

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: "Search query 'q' is required" },
      { status: 400 }
    );
  }

  const maxResults = Math.min(
    parseInt(searchParams.get("limit") || "10", 10),
    25
  );

  try {
    const results = await searchChannels(query.trim(), maxResults);
    return NextResponse.json({
      results,
      quotaCost: 100, // Inform client about the quota cost (D-02)
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "YouTube API error";

    // Handle quota exceeded specifically
    if (message.includes("quotaExceeded")) {
      return NextResponse.json(
        { error: "YouTube API daily quota exceeded. Try again tomorrow." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Failed to search channels", details: message },
      { status: 502 }
    );
  }
}
