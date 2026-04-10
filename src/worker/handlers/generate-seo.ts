import type { Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { projects, scripts, jobs, jobEvents } from "@/lib/db/schema";
import { getUserAIClient } from "@/lib/ai/get-user-ai-client";
import { generateSEO } from "@/lib/distribution/seo-generator";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

/**
 * Handle SEO generation job.
 *
 * Expected payload:
 * - projectId: string
 * - channelNiche?: string
 * - targetAudience?: string
 * - language?: string (default 'ko')
 */
export async function handleGenerateSEO(job: Job, db: DrizzleInstance) {
  const { jobId, userId, payload } = job.data;
  const { projectId, channelNiche, targetAudience, language } = payload;

  if (!projectId) {
    throw new Error("projectId is required in payload");
  }

  try {
    // Update job status
    await db
      .update(jobs)
      .set({ status: "active", progress: 0, currentStep: "loading-script", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "started",
      data: { projectId },
    });

    // 1. Load project's selected script
    const [selectedScript] = await db
      .select()
      .from(scripts)
      .where(
        and(eq(scripts.projectId, projectId), eq(scripts.isSelected, true))
      )
      .limit(1);

    if (!selectedScript) {
      throw new Error(
        "No script selected. Please select a script variant first."
      );
    }

    const scriptContent = selectedScript.content;

    // 2. Get AI client
    await db
      .update(jobs)
      .set({ progress: 20, currentStep: "loading-ai-client", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    const { provider } = await getUserAIClient(userId);

    // 3. Generate SEO
    await db
      .update(jobs)
      .set({ progress: 30, currentStep: "generating-seo", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    const seoResult = await generateSEO({
      provider,
      request: {
        projectId,
        scriptContent,
        channelNiche,
        targetAudience,
        language: language || "ko",
      },
    });

    // 4. Save result
    await db
      .update(jobs)
      .set({ progress: 90, currentStep: "saving", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: 100,
        currentStep: "complete",
        result: seoResult,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: seoResult,
    });

    return seoResult;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    await db
      .update(jobs)
      .set({
        status: "failed",
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "failed",
      data: { error: errorMessage },
    });

    throw error;
  }
}
