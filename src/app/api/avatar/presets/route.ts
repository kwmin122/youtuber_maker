import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { avatarPresets } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";

const querySchema = z.object({
  gender: z.enum(["male", "female", "neutral"]).optional(),
  ageGroup: z.enum(["youth", "adult", "senior"]).optional(),
  style: z.enum(["realistic", "cartoon", "anime", "business"]).optional(),
  provider: z.enum(["heygen", "did"]).optional(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    gender: searchParams.get("gender") ?? undefined,
    ageGroup: searchParams.get("ageGroup") ?? undefined,
    style: searchParams.get("style") ?? undefined,
    provider: searchParams.get("provider") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const f = parsed.data;

  // Ownership filter: global (userId IS NULL) OR caller's own
  const ownership = or(
    isNull(avatarPresets.userId),
    eq(avatarPresets.userId, session.user.id)
  );

  const conds: SQL<unknown>[] = [ownership as SQL<unknown>];
  if (f.gender) conds.push(eq(avatarPresets.gender, f.gender));
  if (f.ageGroup) conds.push(eq(avatarPresets.ageGroup, f.ageGroup));
  if (f.style) conds.push(eq(avatarPresets.style, f.style));
  if (f.provider) conds.push(eq(avatarPresets.provider, f.provider));

  const rows = await db
    .select()
    .from(avatarPresets)
    .where(and(...conds))
    .limit(200);

  return NextResponse.json(rows);
}
