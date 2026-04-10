import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import { eq, desc, and } from "drizzle-orm";

const createProjectSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { title, description } = parsed.data;

  const [created] = await db
    .insert(projects)
    .values({
      userId: session.user.id,
      title,
      description: description || null,
      workflowState: {
        currentStep: 1,
        lastActiveTab: "script",
        completedSteps: [],
        lastEditedAt: new Date().toISOString(),
        draftFlags: {},
      },
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parentLongformId = searchParams.get("parentLongformId");

  const conditions = [eq(projects.userId, session.user.id)];
  if (parentLongformId) {
    conditions.push(eq(projects.parentLongformId, parentLongformId));
  }

  const userProjects = await db
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(desc(projects.updatedAt));

  return NextResponse.json(userProjects);
}
