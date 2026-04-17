import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/get-session";
import { buildTikTokAuthUrl } from "@/lib/auth/tiktok-oauth";

export async function GET(_request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.TIKTOK_CLIENT_KEY) {
    return NextResponse.json(
      { error: "TikTok integration not configured" },
      { status: 503 }
    );
  }

  const state = crypto.randomUUID();
  const authUrl = buildTikTokAuthUrl(state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("tiktok_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
