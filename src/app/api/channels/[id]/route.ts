import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { channels } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await params;

  const [channel] = await db
    .select()
    .from(channels)
    .where(
      and(eq(channels.id, id), eq(channels.userId, session.user.id))
    )
    .limit(1);

  if (!channel) {
    return NextResponse.json(
      { error: "Channel not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(channel);
}

export async function DELETE(
  request: NextRequest,
  { params }: Params
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await params;

  const deleted = await db
    .delete(channels)
    .where(
      and(eq(channels.id, id), eq(channels.userId, session.user.id))
    )
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json(
      { error: "Channel not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
