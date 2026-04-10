import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { avatarPresets } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import { getAdminAvatarProvider } from "@/lib/avatar/provider-factory";
import { CURATED_FALLBACK } from "@/lib/avatar/curated-fallback";
import type { AvatarProviderName } from "@/lib/avatar/provider";

const MAX_PER_PROVIDER = 12;

function isAdmin(userId: string): boolean {
  const allow = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allow.includes(userId);
}

export async function POST() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let totalInserted = 0;

  for (const name of ["heygen", "did"] as AvatarProviderName[]) {
    let entries;
    try {
      const provider = getAdminAvatarProvider(name);
      const live = await provider.listAvatars();
      entries = live.slice(0, MAX_PER_PROVIDER);
    } catch (err) {
      console.warn(
        `[presets/refresh] ${name} live fetch failed, using fallback: ${(err as Error).message}`
      );
      entries = CURATED_FALLBACK.filter((e) => e.provider === name);
    }

    if (entries.length === 0) continue;

    const rows = entries.map((e) => ({
      userId: null,
      provider: name,
      providerAvatarId: e.providerAvatarId,
      gender: e.gender,
      ageGroup: e.ageGroup,
      style: e.style,
      previewImageUrl: e.previewImageUrl,
      voiceIdHint: e.voiceIdHint ?? null,
      source: "library" as const,
    }));

    const inserted = await db
      .insert(avatarPresets)
      .values(rows)
      .onConflictDoNothing({
        target: [avatarPresets.provider, avatarPresets.providerAvatarId],
      })
      .returning({ id: avatarPresets.id });
    totalInserted += inserted.length;
  }

  return NextResponse.json({ inserted: totalInserted });
}
