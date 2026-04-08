import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { scenes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getServerSession } from "@/lib/auth/get-session";

const updateSceneSchema = z.object({
  narration: z.string().optional(),
  imagePrompt: z.string().optional(),
  videoPrompt: z.string().optional(),
  duration: z.number().min(1).max(30).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sceneId: string }> }
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sceneId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateSceneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updateData = {
    ...parsed.data,
    updatedAt: new Date(),
  };

  const [updated] = await db
    .update(scenes)
    .set(updateData)
    .where(eq(scenes.id, sceneId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  return NextResponse.json({ scene: updated });
}
