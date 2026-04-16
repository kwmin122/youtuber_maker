import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { account } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import {
  exchangeInstagramCode,
  exchangeForLongLivedToken,
} from "@/lib/auth/instagram-oauth";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieState = request.cookies.get("instagram_oauth_state")?.value;

  if (!state || !cookieState || state !== cookieState) {
    const response = NextResponse.redirect(
      new URL(
        "/settings/connected-accounts?error=invalid_state",
        request.nextUrl.origin
      )
    );
    response.cookies.delete("instagram_oauth_state");
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
    response.cookies.delete("instagram_oauth_state");
    return response;
  }

  try {
    const { shortLivedToken, userId: igUserId } = await exchangeInstagramCode(code);
    const { accessToken, expiresIn } = await exchangeForLongLivedToken(shortLivedToken);

    const userId = session.user.id;

    // Check if an Instagram account already exists for this user
    const [existing] = await db
      .select({ id: account.id })
      .from(account)
      .where(
        and(
          eq(account.userId, userId),
          eq(account.providerId, "instagram")
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(account)
        .set({
          accessToken,
          refreshToken: null,
          accountId: igUserId,
          accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          refreshTokenExpiresAt: null,
          scope: "instagram_basic,instagram_content_publish",
          updatedAt: new Date(),
        })
        .where(eq(account.id, existing.id));
    } else {
      await db.insert(account).values({
        id: crypto.randomUUID(),
        accountId: igUserId,
        providerId: "instagram",
        userId,
        accessToken,
        refreshToken: null,
        accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        refreshTokenExpiresAt: null,
        scope: "instagram_basic,instagram_content_publish",
      });
    }
  } catch (err) {
    console.error("[Instagram OAuth callback error]", err);
    const response = NextResponse.redirect(
      new URL(
        "/settings/connected-accounts?error=token_exchange_failed",
        request.nextUrl.origin
      )
    );
    response.cookies.delete("instagram_oauth_state");
    return response;
  }

  const response = NextResponse.redirect(
    new URL(
      "/settings/connected-accounts?success=instagram",
      request.nextUrl.origin
    )
  );
  response.cookies.delete("instagram_oauth_state");
  return response;
}
