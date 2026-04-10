import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scenes, scripts, mediaAssets } from "@/lib/db/schema";
import { eq, and, asc, inArray, desc } from "drizzle-orm";
import { getServerSession } from "@/lib/auth/get-session";

type SceneRow = typeof scenes.$inferSelect;
type MediaAssetRow = typeof mediaAssets.$inferSelect;

/**
 * Join the newest completed media asset per (scene, type) onto each
 * scene and surface them as top-level `mediaUrl` / `mediaType` /
 * `audioUrl` fields so `VideoTab` / the v1 editor preview can render
 * without any additional fetches.
 *
 * Phase 7 retry 2, Codex HIGH-3: previously this route returned raw
 * scene rows only, so longform child projects opened with an empty
 * preview even though `media_assets` rows existed. This function
 * preserves backward compatibility with v1 projects that may store
 * inline `imageUrl` / `videoUrl` / `audioUrl` columns on the scene
 * row itself (the fallback branch).
 */
function enrichScene(
  scene: SceneRow,
  assetsByScene: Map<string, MediaAssetRow[]>
) {
  const assets = assetsByScene.get(scene.id) ?? [];
  // Prefer video > image for the visual media, pick latest (by
  // createdAt desc as returned by the query).
  const videoAsset = assets.find((a) => a.type === "video");
  const imageAsset = assets.find((a) => a.type === "image");
  const audioAsset = assets.find((a) => a.type === "audio");

  const visualAsset = videoAsset ?? imageAsset;

  // v1 backward-compat fallback: older scenes may have inline urls.
  // Cast because the TS column type may not declare these legacy
  // fields, but they can exist on legacy rows.
  const legacy = scene as unknown as Record<string, unknown>;
  const legacyMediaUrl =
    (legacy.videoUrl as string | undefined) ??
    (legacy.imageUrl as string | undefined) ??
    undefined;
  const legacyMediaType: "video" | "image" | undefined = legacy.videoUrl
    ? "video"
    : legacy.imageUrl
      ? "image"
      : undefined;
  const legacyAudioUrl = legacy.audioUrl as string | undefined;

  return {
    ...scene,
    mediaUrl: visualAsset?.url ?? legacyMediaUrl ?? null,
    mediaType:
      (visualAsset?.type as "video" | "image" | undefined) ??
      legacyMediaType ??
      null,
    audioUrl: audioAsset?.url ?? legacyAudioUrl ?? null,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  // Get the selected script for this project
  const [selectedScript] = await db
    .select()
    .from(scripts)
    .where(
      and(
        eq(scripts.projectId, projectId),
        eq(scripts.isSelected, true)
      )
    )
    .limit(1);

  if (!selectedScript) {
    return NextResponse.json({ scenes: [], scriptId: null });
  }

  // Get scenes ordered by sceneIndex
  const projectScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.scriptId, selectedScript.id))
    .orderBy(asc(scenes.sceneIndex));

  // Single round-trip: fetch every completed media asset attached to
  // any of these scenes, newest first so `Array.prototype.find` picks
  // the latest per-type asset in `enrichScene`.
  const sceneIds = projectScenes.map((s) => s.id);
  const assetRows: MediaAssetRow[] = sceneIds.length
    ? await db
        .select()
        .from(mediaAssets)
        .where(
          and(
            inArray(mediaAssets.sceneId, sceneIds),
            eq(mediaAssets.status, "completed")
          )
        )
        .orderBy(desc(mediaAssets.createdAt))
    : [];

  const assetsByScene = new Map<string, MediaAssetRow[]>();
  for (const row of assetRows) {
    if (!row.sceneId) continue;
    const bucket = assetsByScene.get(row.sceneId) ?? [];
    bucket.push(row);
    assetsByScene.set(row.sceneId, bucket);
  }

  const enriched = projectScenes.map((s) => enrichScene(s, assetsByScene));

  return NextResponse.json({
    scenes: enriched,
    scriptId: selectedScript.id,
  });
}
