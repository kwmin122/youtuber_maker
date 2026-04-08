import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { jobs, jobEvents, scripts, scenes } from "@/lib/db/schema";
import { getUserAIClient } from "@/lib/ai/get-user-ai-client";
import { buildSceneSplitPrompt, parseSceneSplitResponse } from "@/lib/ai/prompts";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

type SplitScenesPayload = {
  scriptId: string;
  targetSceneCount?: number;
  imageStyle?: string;
};

/**
 * Split a script into scenes using AI.
 * Steps:
 * 1. Load script content
 * 2. Call AI with scene-splitting prompt
 * 3. Parse response
 * 4. Delete existing scenes for this script (if re-splitting)
 * 5. Insert scene rows
 */
export async function handleSplitScenes(
  job: Job,
  db: DrizzleInstance
) {
  const jobId = job.data.jobId as string;
  const userId = job.data.userId as string;
  const payload = job.data.payload as SplitScenesPayload;
  const { scriptId, targetSceneCount, imageStyle } = payload;

  try {
    // Mark as active
    await db
      .update(jobs)
      .set({
        status: "active",
        currentStep: "loading-script",
        progress: 0,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "started",
      data: { scriptId },
    });

    // 1. Load script
    const [script] = await db
      .select()
      .from(scripts)
      .where(eq(scripts.id, scriptId))
      .limit(1);

    if (!script) {
      throw new Error(`Script not found: ${scriptId}`);
    }

    await db
      .update(jobs)
      .set({ currentStep: "calling-ai", progress: 20, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    // 2. Call AI for scene splitting
    const { provider } = await getUserAIClient(userId);
    const { systemInstruction, userPrompt } = buildSceneSplitPrompt({
      scriptContent: script.content,
      scriptTitle: script.title,
      targetSceneCount,
      imageStyle,
    });

    const rawResponse = await provider.generateText(userPrompt, {
      systemInstruction,
      jsonMode: true,
      temperature: 0.5,
      maxTokens: 4096,
    });

    await db
      .update(jobs)
      .set({ currentStep: "parsing-response", progress: 60, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    // 3. Parse response
    const result = parseSceneSplitResponse(rawResponse);

    if (result.scenes.length < 2) {
      throw new Error("AI returned fewer than 2 scenes -- invalid split");
    }

    await db
      .update(jobs)
      .set({ currentStep: "saving-scenes", progress: 80, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    // 4. Delete existing scenes for this script (re-split scenario)
    await db.delete(scenes).where(eq(scenes.scriptId, scriptId));

    // 5. Insert new scenes
    const sceneRows = result.scenes.map((s) => ({
      scriptId,
      sceneIndex: s.sceneIndex,
      narration: s.narration,
      imagePrompt: s.imagePrompt,
      videoPrompt: s.videoPrompt,
      duration: s.estimatedDuration,
    }));

    await db.insert(scenes).values(sceneRows);

    // Mark completed
    await db
      .update(jobs)
      .set({
        status: "completed",
        currentStep: "done",
        progress: 100,
        result: {
          sceneCount: result.scenes.length,
          totalDuration: result.totalEstimatedDuration,
        },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: {
        sceneCount: result.scenes.length,
        totalDuration: result.totalEstimatedDuration,
      },
    });
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
