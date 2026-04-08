import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jobs, mediaAssets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getServerSession } from "@/lib/auth/get-session";
import { getQueue } from "@/lib/queue";
import { deleteFromStorage } from "@/lib/media/storage";

const regenerateSchema = z.object({
  /** Which media type to regenerate */
  type: z.enum(["image", "video", "audio"]),
  /** Optional custom prompt override */
  customPrompt: z.string().optional(),
  /** Image style (for image regeneration) */
  style: z.string().optional(),
  /** TTS voice (for audio regeneration) */
  voice: z.string().optional(),
  /** TTS speed (for audio regeneration) */
  speed: z.number().min(0.5).max(2.0).optional(),
});

/**
 * Regenerate a specific media type for a scene.
 * Deletes the existing asset and enqueues a new generation job.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sceneId: string }> }
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, sceneId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = regenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { type, customPrompt, style, voice, speed } = parsed.data;

  // Delete existing asset of this type for this scene
  const existingAssets = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.sceneId, sceneId),
        eq(mediaAssets.type, type)
      )
    );

  for (const asset of existingAssets) {
    if (asset.storagePath) {
      try {
        await deleteFromStorage("media", asset.storagePath);
      } catch {
        // Storage deletion is best-effort
      }
    }
    await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
  }

  // Map type to job type
  const jobTypeMap = {
    image: "generate-image",
    video: "generate-video",
    audio: "generate-tts",
  } as const;

  const jobType = jobTypeMap[type];

  // Build payload based on type
  const payload: Record<string, unknown> = {
    sceneId,
    projectId,
  };

  if (type === "image") {
    if (customPrompt) payload.customPrompt = customPrompt;
    if (style) payload.style = style;
  } else if (type === "video") {
    if (customPrompt) payload.customPrompt = customPrompt;
  } else if (type === "audio") {
    if (customPrompt) payload.customText = customPrompt;
    if (voice) payload.voice = voice;
    if (speed) payload.speed = speed;
  }

  // Create job
  const [created] = await db
    .insert(jobs)
    .values({
      userId: session.user.id,
      type: jobType,
      projectId,
      status: "pending",
      progress: 0,
      payload,
    })
    .returning();

  // Enqueue
  await getQueue().add(jobType, {
    payload,
    jobId: created.id,
    userId: session.user.id,
  });

  return NextResponse.json(
    { jobId: created.id, status: "pending", type: jobType },
    { status: 201 }
  );
}
