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
    // Idempotency guard — Phase 7 retry 2, HIGH-2.
    //
    // BullMQ retries make the clip handler rerun the full candidate
    // loop. Without this check, a retry after a mid-batch failure
    // would create a SECOND child project for candidates that
    // already succeeded, and orphan the original project row (the
    // candidate's `childProjectId` would be overwritten with the new
    // project id and the old project would become unreachable).
    //
    // If the candidate already has a `childProjectId`, look up the
    // existing project and return the same result shape instead of
    // inserting new rows. The clip upload itself is idempotent by
    // candidateId (same storage path), so re-running the upload is a
    // no-op overwrite.
    const [existingCandidate] = await tx
      .select()
      .from(longformCandidates)
      .where(eq(longformCandidates.id, candidate.id))
      .for("update");

    if (existingCandidate?.childProjectId) {
      const [existingScript] = await tx
        .select()
        .from(scripts)
        .where(eq(scripts.projectId, existingCandidate.childProjectId))
        .limit(1);
      if (existingScript) {
        const [existingScene] = await tx
          .select()
          .from(scenes)
          .where(eq(scenes.scriptId, existingScript.id))
          .limit(1);
        if (existingScene) {
          return {
            projectId: existingCandidate.childProjectId,
            scriptId: existingScript.id,
            sceneId: existingScene.id,
          };
        }
      }
      // Fallthrough: candidate points at a project row that no
      // longer has script/scene rows. Treat as corrupt and
      // re-create. This can happen if the child project was
      // partially deleted out-of-band.
    }

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

    // Insert visual asset pointing at the clipped MP4.
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

    // Insert a matching audio asset pointing at the SAME clipped MP4.
    // The clip MP4 has embedded AAC audio (see clip-longform.ts
    // `-c:a aac -b:a 128k`), so using it as the scene's narration
    // source makes the v1 export pipeline (`export-video.ts`) pick up
    // the original speech/music without any filter-graph changes. This
    // resolves the "[aout] matches no streams" bug that otherwise
    // breaks every longform child project's export, because v1 emits
    // `-map [aout]` unconditionally.
    await tx.insert(mediaAssets).values({
      sceneId: scene.id,
      type: "audio",
      url: clipPublicUrl,
      storagePath: clipStoragePath,
      provider: "ffmpeg-longform-clip",
      status: "completed",
      metadata: {
        sourceId: source.id,
        candidateId: candidate.id,
        startMs: candidate.startMs,
        endMs: candidate.endMs,
        role: "embedded-clip-audio",
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
