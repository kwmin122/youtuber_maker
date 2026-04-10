import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, scripts, thumbnails, jobs } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getServerSession } from "@/lib/auth/get-session";
import { getUserAIClient } from "@/lib/ai/get-user-ai-client";
import { predictViralScore } from "@/lib/distribution/viral-scorer";
import type { SEOResult } from "@/lib/distribution/types";

type RouteParams = { params: Promise<{ id: string }> };

async function verifyProjectOwnership(projectId: string, userId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return project || null;
}

/** POST -- Generate viral score (synchronous -- fast enough for direct response) */
export async function POST(
  _request: NextRequest,
  { params }: RouteParams
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const project = await verifyProjectOwnership(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Load selected script
  const [selectedScript] = await db
    .select()
    .from(scripts)
    .where(
      and(eq(scripts.projectId, projectId), eq(scripts.isSelected, true))
    )
    .limit(1);

  if (!selectedScript) {
    return NextResponse.json(
      { error: "No script selected. Please select a script variant first." },
      { status: 400 }
    );
  }

  // Load latest SEO result (if available)
  const [latestSEOJob] = await db
    .select({ result: jobs.result })
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

  const seo = latestSEOJob?.result as SEOResult | null;

  // Load selected thumbnail
  const [selectedThumb] = await db
    .select({ url: thumbnails.url })
    .from(thumbnails)
    .where(
      and(
        eq(thumbnails.projectId, projectId),
        eq(thumbnails.isSelected, true)
      )
    )
    .limit(1);

  // Get AI client
  const { provider } = await getUserAIClient(session.user.id);

  // Generate viral score
  const result = await predictViralScore({
    provider,
    request: {
      scriptContent: selectedScript.content,
      title: seo?.title || selectedScript.title,
      description: seo?.description,
      hashtags: seo?.hashtags,
      thumbnailUrl: selectedThumb?.url,
    },
  });

  return NextResponse.json(result);
}
