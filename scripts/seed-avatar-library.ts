#!/usr/bin/env bun
import { db } from "@/lib/db";
import { avatarPresets } from "@/lib/db/schema";
import { getAdminAvatarProvider } from "@/lib/avatar/provider-factory";
import { CURATED_FALLBACK, type CuratedFallbackEntry } from "@/lib/avatar/curated-fallback";
import type { AvatarProviderName } from "@/lib/avatar/provider";

const MAX_PER_PROVIDER = 12;

type SeedRow = {
  userId: null;
  provider: AvatarProviderName;
  providerAvatarId: string;
  gender: "male" | "female" | "neutral";
  ageGroup: "youth" | "adult" | "senior";
  style: "realistic" | "cartoon" | "anime" | "business";
  previewImageUrl: string;
  voiceIdHint: string | null;
  source: "library";
};

async function loadProviderEntries(
  name: AvatarProviderName
): Promise<SeedRow[]> {
  try {
    const provider = getAdminAvatarProvider(name);
    const live = await provider.listAvatars();
    if (live.length === 0) throw new Error("empty live response");
    return live.slice(0, MAX_PER_PROVIDER).map((e) => ({
      userId: null,
      provider: name,
      providerAvatarId: e.providerAvatarId,
      gender: e.gender,
      ageGroup: e.ageGroup,
      style: e.style,
      previewImageUrl: e.previewImageUrl,
      voiceIdHint: e.voiceIdHint ?? null,
      source: "library",
    }));
  } catch (err) {
    console.warn(
      `[seed-avatar-library] ${name} live fetch failed: ${(err as Error).message} — using curated fallback`
    );
    const fallback: CuratedFallbackEntry[] = CURATED_FALLBACK.filter(
      (e) => e.provider === name
    );
    return fallback.map((e) => ({
      userId: null,
      provider: name,
      providerAvatarId: e.providerAvatarId,
      gender: e.gender,
      ageGroup: e.ageGroup,
      style: e.style,
      previewImageUrl: e.previewImageUrl,
      voiceIdHint: e.voiceIdHint ?? null,
      source: "library",
    }));
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const heygen = await loadProviderEntries("heygen");
  const did = await loadProviderEntries("did");
  const all = [...heygen, ...did];

  console.log(
    `[seed-avatar-library] prepared ${heygen.length} HeyGen + ${did.length} D-ID = ${all.length} rows`
  );

  if (dryRun) {
    console.log("[seed-avatar-library] dry-run, exiting without insert");
    return;
  }

  if (all.length === 0) {
    console.warn("[seed-avatar-library] nothing to insert");
    return;
  }

  // Dedupe via ON CONFLICT — schema adds a unique index in Task 3
  const inserted = await db
    .insert(avatarPresets)
    .values(all)
    .onConflictDoNothing({
      target: [avatarPresets.provider, avatarPresets.providerAvatarId],
    })
    .returning({ id: avatarPresets.id });

  console.log(
    `[seed-avatar-library] inserted ${inserted.length} new rows (others already present)`
  );
}

main().catch((err) => {
  console.error("[seed-avatar-library] FATAL:", err);
  process.exit(1);
});
