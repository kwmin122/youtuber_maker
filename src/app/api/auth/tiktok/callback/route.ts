import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { account } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import { exchangeTikTokCode } from "@/lib/auth/tiktok-oauth";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieState = request.cookies.get("tiktok_oauth_state")?.value;

  if (!state || !cookieState || state !== cookieState) {
    const response = NextResponse.redirect(
      new URL(
        "/settings/connected-accounts?error=invalid_state",
        request.nextUrl.origin
      )
    );
    response.cookies.delete("tiktok_oauth_state");
    return response;
  }

  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  }

  if (!code) {
    const response = NextResponse.redirect(
      new URL(
        "/settings/connected-accounts?error=missing_code",
        request.nextUrl.origin
      )
    );
    response.cookies.delete("tiktok_oauth_state");
    return response;
  }

  try {
    const { accessToken, refreshToken, openId, expiresIn, refreshExpiresIn, scope } =
      await exchangeTikTokCode(code);

    const userId = session.user.id;

    // Check if a TikTok account already exists for this user
    const [existing] = await db
      .select({ id: account.id })
      .from(account)
      .where(
        and(
          eq(account.userId, userId),
          eq(account.providerId, "tiktok")
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(account)
        .set({
          accessToken,
          refreshToken,
          accountId: openId,
          accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          refreshTokenExpiresAt: new Date(Date.now() + refreshExpiresIn * 1000),
          scope,
          updatedAt: new Date(),
        })
        .where(eq(account.id, existing.id));
    } else {
      await db.insert(account).values({
        id: crypto.randomUUID(),
        accountId: openId,
        providerId: "tiktok",
        userId,
        accessToken,
        refreshToken,
        accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + refreshExpiresIn * 1000),
        scope,
      });
    }
  } catch (err) {
    console.error("[TikTok OAuth callback error]", err);
    const response = NextResponse.redirect(
      new URL(
        "/settings/connected-accounts?error=token_exchange_failed",
        request.nextUrl.origin
      )
    );
    response.cookies.delete("tiktok_oauth_state");
    return response;
  }

  const response = NextResponse.redirect(
    new URL(
      "/settings/connected-accounts?success=tiktok",
      request.nextUrl.origin
    )
  );
  response.cookies.delete("tiktok_oauth_state");
  return response;
}
