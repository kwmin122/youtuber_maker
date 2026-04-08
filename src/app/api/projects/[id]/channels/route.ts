import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects, channels, projectChannels } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

const linkChannelSchema = z.object({
  channelId: z.string().uuid(),
});

export async function POST(request: NextRequest, { params }: Params) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  // Verify project belongs to user
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.userId, session.user.id)
      )
    )
    .limit(1);

  if (!project) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = linkChannelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Verify channel belongs to user
  const [channel] = await db
    .select({ id: channels.id })
    .from(channels)
    .where(
      and(
        eq(channels.id, parsed.data.channelId),
        eq(channels.userId, session.user.id)
      )
    )
    .limit(1);

  if (!channel) {
    return NextResponse.json(
      { error: "Channel not found" },
      { status: 404 }
    );
  }

  // Link channel to project (upsert -- ignore if already linked)
  const [linked] = await db
    .insert(projectChannels)
    .values({
      projectId,
      channelId: parsed.data.channelId,
    })
    .onConflictDoNothing()
    .returning();

  return NextResponse.json(
    linked || { projectId, channelId: parsed.data.channelId },
    { status: 201 }
  );
}

export async function GET(request: NextRequest, { params }: Params) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  // Verify project belongs to user
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.userId, session.user.id)
      )
    )
    .limit(1);

  if (!project) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    );
  }

  // Get linked channels with full channel data
  const linkedChannels = await db
    .select({
      linkId: projectChannels.id,
      addedAt: projectChannels.addedAt,
      channel: channels,
    })
    .from(projectChannels)
    .innerJoin(channels, eq(projectChannels.channelId, channels.id))
    .where(eq(projectChannels.projectId, projectId));

  return NextResponse.json(linkedChannels);
}

export async function DELETE(
  request: NextRequest,
  { params }: Params
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId");

  if (!channelId) {
    return NextResponse.json(
      { error: "channelId query param required" },
      { status: 400 }
    );
  }

  // Verify project belongs to user
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.userId, session.user.id)
      )
    )
    .limit(1);

  if (!project) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    );
  }

  const deleted = await db
    .delete(projectChannels)
    .where(
      and(
        eq(projectChannels.projectId, projectId),
        eq(projectChannels.channelId, channelId)
      )
    )
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json(
      { error: "Link not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
