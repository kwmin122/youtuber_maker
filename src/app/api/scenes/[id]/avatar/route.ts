import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scenes, scripts, projects } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";

const bodySchema = z.object({
  avatarPresetId: z.string().uuid().nullable().optional(),
  avatarLayout: z
    .object({
      enabled: z.boolean(),
      position: z.enum([
        "bottom-right",
        "bottom-left",
        "center",
        "top-right",
        "fullscreen",
      ]),
      scale: z.number().min(0.1).max(1),
      paddingPx: z.number().int().min(0).max(128),
    })
    .nullable()
    .optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Ownership join: scenes → scripts → projects → userId
  const [row] = await db
    .select({
      sceneId: scenes.id,
      userId: projects.userId,
    })
    .from(scenes)
    .leftJoin(scripts, eq(scripts.id, scenes.scriptId))
    .leftJoin(projects, eq(projects.id, scripts.projectId))
    .where(eq(scenes.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (row.userId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await db
    .update(scenes)
    .set({
      ...(parsed.data.avatarPresetId !== undefined && {
        avatarPresetId: parsed.data.avatarPresetId,
      }),
      ...(parsed.data.avatarLayout !== undefined && {
        avatarLayout: parsed.data.avatarLayout,
      }),
      updatedAt: new Date(),
    })
    .where(eq(scenes.id, id));

  return NextResponse.json({ updated: true });
}
