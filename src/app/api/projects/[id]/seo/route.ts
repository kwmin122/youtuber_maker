import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects, jobs } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getServerSession } from "@/lib/auth/get-session";
import { getQueue } from "@/lib/queue";

type RouteParams = { params: Promise<{ id: string }> };

async function verifyProjectOwnership(projectId: string, userId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return project || null;
}

const seoRequestSchema = z.object({
  channelNiche: z.string().optional(),
  targetAudience: z.string().optional(),
  language: z.string().optional().default("ko"),
});

/** POST -- Trigger SEO generation job */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const project = await verifyProjectOwnership(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = seoRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { channelNiche, targetAudience, language } = parsed.data;

  const [created] = await db
    .insert(jobs)
    .values({
      userId: session.user.id,
      type: "generate-seo",
      projectId,
      status: "pending",
      progress: 0,
      payload: { projectId, channelNiche, targetAudience, language },
    })
    .returning();

  await getQueue().add("generate-seo", {
    payload: { projectId, channelNiche, targetAudience, language },
    jobId: created.id,
    userId: session.user.id,
  });

  return NextResponse.json(
    { jobId: created.id, status: "pending" },
    { status: 201 }
  );
}

/** GET -- Get the latest SEO result for this project */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const project = await verifyProjectOwnership(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const [latestSEOJob] = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      result: jobs.result,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.projectId, projectId),
        eq(jobs.type, "generate-seo"),
        eq(jobs.status, "completed")
      )
    )
    .orderBy(desc(jobs.createdAt))
    .limit(1);

  if (!latestSEOJob) {
    return NextResponse.json({ seo: null });
  }

  return NextResponse.json({
    seo: latestSEOJob.result,
    generatedAt: latestSEOJob.createdAt,
  });
}
