import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projects,
  scripts,
  scenes,
  mediaAssets,
  longformCandidates,
  longformSources,
} from "@/lib/db/schema";
import { DEFAULT_SUBTITLE_STYLE } from "@/lib/video/types";

/**
 * Create a full child project for a single longform clip candidate.
 *
 * Creates, inside a single `db.transaction`:
 *   1. `projects` row with `parentLongformId` set and a synthetic
 *      `workflowState` advanced to step 4 (video tab) so the v1 UI
 *      opens straight into the editor.
 *   2. `scripts` row with `analysisId = null`, `variant = 'longform'`,
 *      and `content = transcriptSnippet`. Relies on the 07-04 schema
 *      migration that drops NOT NULL from `scripts.analysis_id`.
 *   3. A single `scenes` row (sceneIndex = 0) representing the clip,
 *      with `sourceType = 'longform-clip'` and the start/end markers
 *      needed by Phase 7 playback.
 *   4. A `media_assets` row of type 'video' whose url/storagePath
 *      point at the already-uploaded clipped MP4.
 *   5. Flips the candidate's `selected = true` and sets
 *      `childProjectId` to the new project id.
 *
 * Atomicity: all 5 operations run inside `db.transaction(async (tx) =>
 * ...)` so a partial failure rolls back cleanly.
 */
export type CreateChildProjectParams = {
  userId: string;
  source: typeof longformSources.$inferSelect;
  candidate: typeof longformCandidates.$inferSelect;
  clipPublicUrl: string;
  clipStoragePath: string;
};

export type CreateChildProjectResult = {
  projectId: string;
  scriptId: string;
  sceneId: string;
};

export async function createChildProjectForClip(
  params: CreateChildProjectParams,
  dbInstance: typeof db = db
): Promise<CreateChildProjectResult> {
  const { userId, source, candidate, clipPublicUrl, clipStoragePath } = params;

  const durationMs = candidate.endMs - candidate.startMs;
  if (durationMs <= 0) {
    throw new Error(
      `Invalid candidate duration: startMs=${candidate.startMs}, endMs=${candidate.endMs}`
    );
  }
  const durationSeconds = durationMs / 1000;
  const snippet = candidate.transcriptSnippet ?? "";
  const title =
    candidate.titleSuggestion?.trim() || source.title || "Longform clip";
  const wordCount = snippet.split(/\s+/).filter(Boolean).length;

  return await dbInstance.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        userId,
        title,
        description: candidate.reason,
        parentLongformId: source.id,
        workflowState: {
          currentStep: 4,
          lastActiveTab: "video",
          completedSteps: [1, 2, 3],
          lastEditedAt: new Date().toISOString(),
          draftFlags: { fromLongform: true },
        },
      })
      .returning();

    if (!project) {
      throw new Error("Failed to insert child project row");
    }

    const [script] = await tx
      .insert(scripts)
      .values({
        projectId: project.id,
        analysisId: null,
        title,
        content: snippet,
        variant: "longform",
        hookType: "longform",
        structureType: "longform-clip",
        wordCount,
        estimatedDuration: Math.max(1, Math.round(durationSeconds)),
        isSelected: true,
        aiProvider: "gemini",
      })
      .returning();

    if (!script) {
      throw new Error("Failed to insert synthetic script row");
    }

    const [scene] = await tx
      .insert(scenes)
      .values({
        scriptId: script.id,
        sceneIndex: 0,
        narration: snippet,
        imagePrompt: "",
        videoPrompt: "",
        duration: durationSeconds,
        subtitleStyle: DEFAULT_SUBTITLE_STYLE,
        transitionType: "cut",
        transitionDuration: 0,
        sourceType: "longform-clip",
        sourceClipStartMs: candidate.startMs,
        sourceClipEndMs: candidate.endMs,
        sourceLongformId: source.id,
      })
      .returning();

    if (!scene) {
      throw new Error("Failed to insert longform-clip scene row");
    }

    await tx.insert(mediaAssets).values({
      sceneId: scene.id,
      type: "video",
      url: clipPublicUrl,
      storagePath: clipStoragePath,
      provider: "ffmpeg-longform-clip",
      status: "completed",
      metadata: {
        sourceId: source.id,
        candidateId: candidate.id,
        startMs: candidate.startMs,
        endMs: candidate.endMs,
      },
    });

    await tx
      .update(longformCandidates)
      .set({
        selected: true,
        childProjectId: project.id,
      })
      .where(eq(longformCandidates.id, candidate.id));

    return {
      projectId: project.id,
      scriptId: script.id,
      sceneId: scene.id,
    };
  });
}
