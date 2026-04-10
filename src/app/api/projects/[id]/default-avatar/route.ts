import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";

const bodySchema = z.object({
  defaultAvatarPresetId: z.string().uuid().nullable(),
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
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (row.userId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await db
    .update(projects)
    .set({
      defaultAvatarPresetId: parsed.data.defaultAvatarPresetId,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id));

  return NextResponse.json({ updated: true });
}
