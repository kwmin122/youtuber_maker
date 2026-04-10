/**
 * Phase 7 longform analysis prompt builders.
 *
 * Given a long-form video (transcript or audio), ask Gemini 2.5 Pro
 * to pick the segments most likely to go viral as 30-60s shorts and
 * return them as strict JSON. Scoring dimensions and JSON schema are
 * documented here and mirrored in {@link ./segment-validator.ts}.
 */

import type { TranscriptSegment } from "@/lib/youtube/transcript";

export const LONGFORM_SYSTEM_INSTRUCTION = `You are a YouTube Shorts viral segment extractor. Given a long-form video transcript or audio, identify the segments most likely to go viral as 30-60 second shorts.

Score each candidate on four 0-100 dimensions:
- hookScore: how gripping the first 3 seconds of the segment are
- emotionalScore: emotional resonance (humor, surprise, empathy, anger, awe)
- informationDensity: value per second -- how much the viewer learns/feels
- trendScore: alignment with current cultural trends and topics

For each candidate include:
- startMs, endMs (integers, end > start, duration between 30000ms and 60000ms)
- all four scores (0-100 integers)
- reason: one or two sentences explaining why the segment would perform
- titleSuggestion: a punchy <=60 char title in the transcript's language
- transcriptSnippet: the transcript text inside this segment (<=500 chars)

Return ONLY valid JSON matching this exact schema:
{
  "candidates": [
    {
      "startMs": number,
      "endMs": number,
      "hookScore": number,
      "emotionalScore": number,
      "informationDensity": number,
      "trendScore": number,
      "reason": string,
      "titleSuggestion": string,
      "transcriptSnippet": string
    }
  ]
}`;

export interface TranscriptPromptParams {
  title: string | null;
  durationSeconds: number;
  targetCount: number;
  transcript: TranscriptSegment[];
}

export function buildTranscriptPrompt(params: TranscriptPromptParams): string {
  const transcriptText = params.transcript
    .map((s) => `[${formatMs(s.offset)}] ${s.text}`)
    .join("\n");

  return [
    `## Source`,
    `Title: ${params.title ?? "(unknown)"}`,
    `Duration: ${params.durationSeconds}s`,
    ``,
    `## Transcript with timestamps`,
    transcriptText,
    ``,
    `## Task`,
    `Extract exactly ${params.targetCount} high-potential shorts candidates. Each must be 30-60 seconds long. Segments must NOT overlap. Return JSON only.`,
  ].join("\n");
}

export interface AudioPromptParams {
  title: string | null;
  durationSeconds: number;
  targetCount: number;
}

export function buildAudioPrompt(params: AudioPromptParams): string {
  return [
    `## Source`,
    `Title: ${params.title ?? "(unknown)"}`,
    `Duration: ${params.durationSeconds}s`,
    ``,
    `## Task`,
    `The attached audio file is the full source. Listen to it and extract exactly ${params.targetCount} high-potential shorts candidates. Each must be 30-60 seconds long. Segments must NOT overlap. For transcriptSnippet, write a brief paraphrase of what is said in that segment. Return JSON only.`,
  ].join("\n");
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
