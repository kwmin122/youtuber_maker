import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { account } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";

export async function GET(_request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      providerId: account.providerId,
      accountId: account.accountId,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
      scope: account.scope,
    })
    .from(account)
    .where(eq(account.userId, session.user.id));

  const byProvider = Object.fromEntries(
    rows.map((row) => [row.providerId, row])
  );

  const google = byProvider["google"];
  const tiktok = byProvider["tiktok"];
  const instagram = byProvider["instagram"];

  const tiktokConfigured = !!(
    process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET
  );
  const instagramConfigured = !!(
    process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET
  );

  return NextResponse.json({
    google: {
      connected: !!google,
      expiresAt: google?.accessTokenExpiresAt?.toISOString() ?? null,
    },
    tiktok: {
      connected: !!tiktok,
      expiresAt: tiktok?.accessTokenExpiresAt?.toISOString() ?? null,
    },
    instagram: {
      connected: !!instagram,
      expiresAt: instagram?.accessTokenExpiresAt?.toISOString() ?? null,
    },
    tiktokConfigured,
    instagramConfigured,
  });
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = body as { providerId?: string };
  const providerId = parsed?.providerId;

  if (providerId !== "tiktok" && providerId !== "instagram") {
    return NextResponse.json(
      { error: "Invalid providerId. Must be 'tiktok' or 'instagram'." },
      { status: 400 }
    );
  }

  await db
    .delete(account)
    .where(
      and(
        eq(account.userId, session.user.id),
        eq(account.providerId, providerId)
      )
    );

  return NextResponse.json({ success: true }, { status: 200 });
}
