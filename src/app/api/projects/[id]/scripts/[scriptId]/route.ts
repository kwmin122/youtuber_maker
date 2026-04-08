import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scripts, projects } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string; scriptId: string }>;
}

/**
 * PATCH /api/projects/:id/scripts/:scriptId
 * Select a script variant (set isSelected = true, deselect others with same title).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, scriptId } = await params;

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

  // Get the script to find its title for group deselection
  const [script] = await db
    .select()
    .from(scripts)
    .where(
      and(
        eq(scripts.id, scriptId),
        eq(scripts.projectId, projectId)
      )
    )
    .limit(1);

  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  // Deselect all variants with the same title in this project
  await db
    .update(scripts)
    .set({ isSelected: false })
    .where(
      and(
        eq(scripts.projectId, projectId),
        eq(scripts.title, script.title)
      )
    );

  // Select this variant
  const [updated] = await db
    .update(scripts)
    .set({ isSelected: true })
    .where(eq(scripts.id, scriptId))
    .returning();

  return NextResponse.json(updated);
}
