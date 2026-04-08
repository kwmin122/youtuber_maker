import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import {
  jobs,
  jobEvents,
  analyses,
  scripts,
} from "@/lib/db/schema";
import { getUserAIClient } from "@/lib/ai/get-user-ai-client";
import {
  buildScriptGenerationPrompt,
  getVariantStrategies,
  type ScriptGenerationInput,
} from "@/lib/ai/prompts";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

type GenerateScriptPayload = {
  projectId: string;
  analysisId: string;
  /** Index into topicRecommendations array */
  topicIndex: number;
};

/**
 * Generate A/B script variants for a selected topic.
 * Steps:
 * 1. Load analysis result
 * 2. Extract selected topic + tone/hook/structure data
 * 3. Generate 2-3 variants in parallel (different hook/structure combos)
 * 4. Save each variant to scripts table
 */
export async function handleGenerateScript(
  job: Job,
  db: DrizzleInstance
) {
  const jobId = job.data.jobId as string;
  const userId = job.data.userId as string;
  const payload = job.data.payload as GenerateScriptPayload;
  const { projectId, analysisId, topicIndex } = payload;

  try {
    // Mark as active
    await db
      .update(jobs)
      .set({
        status: "active",
        currentStep: "loading-analysis",
        progress: 0,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "started",
      data: { type: "generate-script", analysisId, topicIndex },
    });

    // 1. Load analysis
    const [analysis] = await db
      .select()
      .from(analyses)
      .where(eq(analyses.id, analysisId))
      .limit(1);

    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    // Type assertions for JSONB columns
    const toneAnalysis = analysis.toneAnalysis as ScriptGenerationInput["toneAnalysis"];
    const hookingPatterns = analysis.hookingPatterns as Array<{
      type: string;
      description: string;
      example: string;
      frequency: number;
    }>;
    const structurePatterns = analysis.structurePatterns as Array<{
      name: string;
      sections: string[];
      sectionDurations: number[];
      frequency: number;
    }>;
    const topicRecommendations = analysis.topicRecommendations as Array<{
      title: string;
      description: string;
      rationale: string;
      suggestedHookType: string;
      suggestedStructure: string;
      viralPotential: string;
    }>;

    // 2. Get selected topic
    if (topicIndex < 0 || topicIndex >= topicRecommendations.length) {
      throw new Error(
        `Invalid topic index ${topicIndex}. Available: 0-${topicRecommendations.length - 1}`
      );
    }
    const selectedTopic = topicRecommendations[topicIndex];

    await db
      .update(jobs)
      .set({
        currentStep: "preparing-variants",
        progress: 10,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    // 3. Get user's AI provider
    const { provider } = await getUserAIClient(userId);

    // 4. Generate variant strategies
    const variantStrategies = getVariantStrategies(
      hookingPatterns,
      structurePatterns
    );

    const generatedScripts: Array<{
      variant: string;
      content: string;
      hookType: string;
      structureType: string;
    }> = [];

    // 5. Generate each variant sequentially (to avoid rate limits)
    for (let i = 0; i < variantStrategies.length; i++) {
      const vs = variantStrategies[i];
      const progress = Math.round(15 + ((i + 1) / variantStrategies.length) * 65);

      await db
        .update(jobs)
        .set({
          currentStep: `generating-variant-${vs.variant}`,
          progress,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      const input: ScriptGenerationInput = {
        topicTitle: selectedTopic.title,
        topicDescription: selectedTopic.description,
        toneAnalysis,
        hookType: vs.hookType,
        structureType: vs.structureType,
        variant: vs.variant,
        variantStrategy: vs.strategy,
      };

      const { systemInstruction, userPrompt } =
        buildScriptGenerationPrompt(input);

      const scriptContent = await provider.generateText(userPrompt, {
        systemInstruction,
        temperature: 0.8,
        maxTokens: 2048,
      });

      generatedScripts.push({
        variant: vs.variant,
        content: scriptContent.trim(),
        hookType: vs.hookType,
        structureType: vs.structureType,
      });

      await db.insert(jobEvents).values({
        jobId,
        event: "progress",
        data: {
          variant: vs.variant,
          wordCount: scriptContent.trim().split(/\s+/).length,
        },
      });

      // Small delay between AI calls
      if (i < variantStrategies.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // 6. Save all variants to DB
    await db
      .update(jobs)
      .set({
        currentStep: "saving-scripts",
        progress: 85,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    const savedScriptIds: string[] = [];
    for (const gs of generatedScripts) {
      const wordCount = gs.content.split(/\s+/).length;
      // Korean: ~3 words/sec for natural speech
      const estimatedDuration = Math.round(wordCount / 3) * 2;

      const [saved] = await db
        .insert(scripts)
        .values({
          projectId,
          analysisId,
          title: selectedTopic.title,
          content: gs.content,
          variant: gs.variant,
          hookType: gs.hookType,
          structureType: gs.structureType,
          wordCount,
          estimatedDuration: Math.min(estimatedDuration, 60),
          aiProvider: provider.name,
        })
        .returning({ id: scripts.id });

      savedScriptIds.push(saved.id);
    }

    // Mark as completed
    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: 100,
        currentStep: "done",
        result: {
          scriptIds: savedScriptIds,
          variantsGenerated: generatedScripts.length,
          topic: selectedTopic.title,
          provider: provider.name,
        },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: {
        scriptIds: savedScriptIds,
        variantsGenerated: generatedScripts.length,
      },
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";

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

    throw err;
  }
}
