import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, projects } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";

/**
 * GET /api/avatar/scene-progress?projectId=<uuid>
 *
 * Returns a map of { [sceneId]: { status, progress } } for the latest
 * generate-avatar-lipsync job per scene, ownership-gated on projects.userId.
 */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  // Ownership check — ensure project belongs to the requesting user
  const [project] = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (project.userId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Fetch all generate-avatar-lipsync jobs for this project/user, ordered by createdAt desc
  const rows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      progress: jobs.progress,
      sceneId: sql<string>`${jobs.payload}->>'sceneId'`,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.type, "generate-avatar-lipsync"),
        eq(jobs.projectId, projectId),
        eq(jobs.userId, session.user.id)
      )
    )
    .orderBy(jobs.createdAt);

  // Group by sceneId, keeping only the latest (last) entry per scene
  const progressMap: Record<string, { status: string; progress: number }> = {};
  for (const row of rows) {
    if (!row.sceneId) continue;
    // Since rows are ordered ascending, later rows overwrite earlier ones — gives us the latest
    progressMap[row.sceneId] = { status: row.status, progress: row.progress };
  }

  return NextResponse.json(progressMap);
}
