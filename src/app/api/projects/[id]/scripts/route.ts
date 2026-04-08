import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scripts, projects } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import { eq, and, desc } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/:id/scripts
 * List all scripts for a project, grouped by analysisId and title.
 * Optionally filter by analysisId query param.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const { searchParams } = new URL(request.url);
  const analysisId = searchParams.get("analysisId");

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

  const conditions = [eq(scripts.projectId, projectId)];
  if (analysisId) {
    conditions.push(eq(scripts.analysisId, analysisId));
  }

  const projectScripts = await db
    .select()
    .from(scripts)
    .where(and(...conditions))
    .orderBy(desc(scripts.createdAt));

  return NextResponse.json(projectScripts);
}
