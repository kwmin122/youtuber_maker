import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  jobs,
  jobEvents,
  longformSources,
  longformCandidates,
} from "@/lib/db/schema";
import { getUserAIClient } from "@/lib/ai/get-user-ai-client";
import { fetchTranscript, type TranscriptResult } from "@/lib/youtube/transcript";
import { parseVideoUrl } from "@/lib/youtube/parse-url";
import {
  LONGFORM_SYSTEM_INSTRUCTION,
  buildTranscriptPrompt,
  buildAudioPrompt,
} from "@/lib/longform/analyze-prompt";
import { parseAndValidateCandidates } from "@/lib/longform/segment-validator";
import { downloadLongformSource } from "@/lib/media/longform-storage";
import { extractAudioForAnalysis } from "@/lib/video/extract-audio";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
  select: typeof import("@/lib/db").db.select;
  delete: typeof import("@/lib/db").db.delete;
};

type AnalyzePayload = {
  sourceId: string;
  targetCount?: number;
  mode?: "auto" | "transcript" | "audio";
};

type AnalyzeJobData = {
  jobId: string;
  userId: string;
  payload: AnalyzePayload;
};

const DEFAULT_TARGET_COUNT = 8;
const MIN_TARGET_COUNT = 5;
const MAX_TARGET_COUNT = 10;

export async function handleLongformAnalyze(
  job: Job,
  db: DrizzleInstance
): Promise<{ sourceId: string; candidateCount: number; mode: string }> {
  const { jobId, userId, payload } = job.data as AnalyzeJobData;
  if (!payload?.sourceId) {
    throw new Error("sourceId is required in payload");
  }
  const sourceId = payload.sourceId;
  const targetCount = clampTarget(payload.targetCount ?? DEFAULT_TARGET_COUNT);
  const modeHint = payload.mode ?? "auto";

  let tempDir: string | null = null;

  try {
    await db
      .update(jobs)
      .set({
        status: "active",
        currentStep: "loading source",
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
    await db.insert(jobEvents).values({
      jobId,
      event: "started",
      data: { sourceId, targetCount, modeHint },
    });

    const [source] = await db
      .select()
      .from(longformSources)
      .where(eq(longformSources.id, sourceId));
    if (!source) throw new Error(`longform_source ${sourceId} not found`);
    // Defense in depth — the /api/jobs route already rejects cross-user
    // longform enqueues, but the handler must also refuse to act on a
    // source it does not own. Phase 7 retry 2, Codex CRITICAL-2.
    if (source.userId !== userId) {
      throw new Error(
        `longform source ${sourceId} does not belong to user ${userId}`
      );
    }
    if (source.status !== "ready") {
      throw new Error(`source not ready: status=${source.status}`);
    }

    await db
      .update(longformSources)
      .set({ status: "analyzing", updatedAt: new Date() })
      .where(eq(longformSources.id, sourceId));

    const { provider } = await getUserAIClient(userId, "gemini");
    if (provider.name !== "gemini") {
      throw new Error(
        "longform analysis requires a Gemini API key; none registered"
      );
    }
    if (!provider.generateTextWithModel || !provider.generateJsonFromAudio) {
      throw new Error(
        "Gemini provider missing longform methods -- update src/lib/ai/gemini.ts"
      );
    }

    // Decide mode
    let chosenMode: "transcript" | "audio" = "audio";
    let transcript: TranscriptResult | null = null;

    if (
      modeHint !== "audio" &&
      source.sourceType === "url" &&
      source.sourceUrl
    ) {
      const parsed = parseVideoUrl(source.sourceUrl);
      if (parsed) {
        await db
          .update(jobs)
          .set({
            currentStep: "fetching transcript",
            progress: 10,
            updatedAt: new Date(),
          })
          .where(eq(jobs.id, jobId));
        transcript = await fetchTranscript(parsed.videoId);
        if (transcript) chosenMode = "transcript";
      }
    }

    if (modeHint === "transcript" && !transcript) {
      throw new Error(
        "transcript mode forced but no captions were found for this source"
      );
    }

    let rawJson: string;

    if (chosenMode === "transcript" && transcript) {
      // Persist transcript onto the source row.
      // Schema allows source: 'youtube-transcript' | 'gemini-audio'; we only
      // reach this branch for youtube-transcript.
      await db
        .update(longformSources)
        .set({
          transcript: {
            segments: transcript.segments,
            fullText: transcript.fullText,
            language: transcript.language,
            source: "youtube-transcript",
          },
          updatedAt: new Date(),
        })
        .where(eq(longformSources.id, sourceId));

      const prompt = buildTranscriptPrompt({
        title: source.title,
        durationSeconds: source.durationSeconds ?? 0,
        targetCount,
        transcript: transcript.segments,
      });

      await db
        .update(jobs)
        .set({
          currentStep: "analyzing transcript with gemini-2.5-pro",
          progress: 40,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      rawJson = await provider.generateTextWithModel(prompt, {
        systemInstruction: LONGFORM_SYSTEM_INSTRUCTION,
        jsonMode: true,
        temperature: 0.3,
        maxTokens: 8192,
        model: "gemini-2.5-pro",
      });
    } else {
      if (!source.storagePath) {
        throw new Error("audio mode requires longform_sources.storagePath");
      }

      tempDir = await mkdtemp(join(tmpdir(), "longform-analyze-"));
      const videoPath = join(tempDir, "source.mp4");
      const audioPath = join(tempDir, "audio.mp3");

      await db
        .update(jobs)
        .set({
          currentStep: "downloading source",
          progress: 10,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));
      const buffer = await downloadLongformSource(source.storagePath);
      await writeFile(videoPath, buffer);

      await db
        .update(jobs)
        .set({
          currentStep: "extracting audio",
          progress: 30,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));
      await extractAudioForAnalysis(videoPath, audioPath);

      const prompt = buildAudioPrompt({
        title: source.title,
        durationSeconds: source.durationSeconds ?? 0,
        targetCount,
      });

      await db
        .update(jobs)
        .set({
          currentStep: "uploading audio to gemini",
          progress: 55,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      rawJson = await provider.generateJsonFromAudio({
        audioPath,
        mimeType: "audio/mpeg",
        prompt,
        systemInstruction: LONGFORM_SYSTEM_INSTRUCTION,
        model: "gemini-2.5-pro",
        temperature: 0.3,
      });
    }

    await db
      .update(jobs)
      .set({
        currentStep: "parsing candidates",
        progress: 85,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    const candidates = parseAndValidateCandidates(rawJson, {
      targetCount,
      sourceDurationSeconds: source.durationSeconds ?? 0,
    });
    if (candidates.length === 0) {
      throw new Error("Gemini returned zero valid candidates");
    }

    await db.insert(longformCandidates).values(
      candidates.map((c) => ({
        sourceId,
        startMs: c.startMs,
        endMs: c.endMs,
        hookScore: c.hookScore,
        emotionalScore: c.emotionalScore,
        informationDensity: c.informationDensity,
        trendScore: c.trendScore,
        reason: c.reason,
        titleSuggestion: c.titleSuggestion,
        transcriptSnippet: c.transcriptSnippet,
      }))
    );

    await db
      .update(longformSources)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(longformSources.id, sourceId));

    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: 100,
        currentStep: "analysis complete",
        result: {
          sourceId,
          candidateCount: candidates.length,
          mode: chosenMode,
        },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: { sourceId, candidateCount: candidates.length, mode: chosenMode },
    });

    return { sourceId, candidateCount: candidates.length, mode: chosenMode };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await db
      .update(jobs)
      .set({
        status: "failed",
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
    await db
      .update(longformSources)
      .set({ status: "failed", errorMessage, updatedAt: new Date() })
      .where(eq(longformSources.id, sourceId));
    await db.insert(jobEvents).values({
      jobId,
      event: "failed",
      data: { error: errorMessage },
    });
    throw error;
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function clampTarget(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_TARGET_COUNT;
  return Math.max(MIN_TARGET_COUNT, Math.min(MAX_TARGET_COUNT, Math.round(n)));
}
