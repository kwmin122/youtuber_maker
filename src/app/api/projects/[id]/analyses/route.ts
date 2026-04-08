import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analyses, projects } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import { eq, and, desc } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/:id/analyses
 * List all analyses for a project (newest first).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  // Verify project ownership
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
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const projectAnalyses = await db
    .select()
    .from(analyses)
    .where(eq(analyses.projectId, projectId))
    .orderBy(desc(analyses.createdAt));

  return NextResponse.json(projectAnalyses);
}
