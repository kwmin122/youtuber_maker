import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/get-session";
import { buildInstagramAuthUrl } from "@/lib/auth/instagram-oauth";

export async function GET(_request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.INSTAGRAM_APP_ID) {
    return NextResponse.json(
      { error: "Instagram integration not configured" },
      { status: 503 }
    );
  }

  const state = crypto.randomUUID();
  const authUrl = buildInstagramAuthUrl(state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("instagram_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
