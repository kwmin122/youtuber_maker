import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { getQueue } from "@/lib/queue";
import { getServerSession } from "@/lib/auth/get-session";
import { eq, desc, and } from "drizzle-orm";

const submitJobSchema = z.object({
  type: z.string().min(1),
  projectId: z.string().uuid().optional(),
  payload: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = submitJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { type, projectId, payload } = parsed.data;

  // Insert job row with status pending
  const [created] = await db
    .insert(jobs)
    .values({
      userId: session.user.id,
      type,
      projectId: projectId || null,
      status: "pending",
      progress: 0,
      payload: payload || null,
    })
    .returning();

  // Enqueue to BullMQ — pass jobId and userId, NEVER plaintext API keys
  await getQueue().add(type, {
    jobId: created.id,
    userId: session.user.id,
    ...(payload || {}),
  });

  return NextResponse.json(
    { jobId: created.id, status: "pending" },
    { status: 201 }
  );
}

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  const conditions = [eq(jobs.userId, session.user.id)];
  if (projectId) {
    conditions.push(eq(jobs.projectId, projectId));
  }

  const userJobs = await db
    .select({
      id: jobs.id,
      type: jobs.type,
      status: jobs.status,
      progress: jobs.progress,
      currentStep: jobs.currentStep,
      errorMessage: jobs.errorMessage,
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .where(and(...conditions))
    .orderBy(desc(jobs.createdAt))
    .limit(50);

  return NextResponse.json(userJobs);
}
