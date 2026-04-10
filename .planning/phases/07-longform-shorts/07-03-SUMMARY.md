# Plan 07-03 Summary

**Status**: DONE
**Phase**: 7 — Long-form to Shorts
**Tasks**: 8/9 (Task 8 deferred per scope constraint — see Deviations)

## Tasks Completed

| # | Task | Commit |
|---|---|---|
| 1 | Extend AIProvider interface (audio + model-override hooks) | `8ccda1d` |
| 2 | Gemini Files API + gemini-2.5-pro longform path | `9010654` |
| 3 | OpenAI provider stubs (throws descriptive error) | `ae1d99d` |
| 4 | analyze-prompt.ts (system instruction + builders) | `2e781ba` |
| 5 | segment-validator.ts (clamp/enforce/overlap) | `2e781ba` |
| 6 | extract-audio.ts + longform-storage.ts helpers | `e1b7658` |
| 7 | longform-analyze handler (transcript + audio modes) | `e3923a1` |
| 9 | Unit tests (prompt, validator, handler) | `a25d844` |

## Files Created

- `src/lib/longform/analyze-prompt.ts`
- `src/lib/longform/segment-validator.ts`
- `src/lib/video/extract-audio.ts`
- `src/lib/video/longform-storage.ts`
- `src/__tests__/longform-analyze-prompt.test.ts`
- `src/__tests__/longform-segment-validator.test.ts`
- `src/__tests__/longform-analyze-handler.test.ts`

## Files Modified

- `src/lib/ai/types.ts` — new `GenerateJsonFromAudioParams` type + optional provider methods
- `src/lib/ai/gemini.ts` — Files API upload/poll/delete, `gemini-2.5-pro` support
- `src/lib/ai/openai.ts` — explicit "not supported" stubs
- `src/worker/handlers/longform-analyze.ts` — full implementation replacing stub

## Test Results

- **New tests**: 29 passed (3 files)
  - prompt builder: 8 tests
  - segment validator: 12 tests
  - handler (mocked): 9 tests
- **Full suite**: 269 passed across 40 files — no regressions
- **Typecheck**: clean ignoring pre-existing errors in `signin/form.tsx`, `queuedash`, `projects/[id]/page.tsx`

## Deviations

1. **Task 8 (POST /api/longform/sources/[id]/analyze) deferred.** The orchestrator instructions explicitly said not to touch `src/app/api/longform/sources/`, which is owned by Plan 07-02. That route is the only remaining piece to let the UI kick off analysis from a source ID. Plan 07-02 already committed the sibling upload routes, so adding the `analyze` subroute is a small follow-up. Logged here so Plan 07-05 (UI) or a 07-02 patch can pick it up.
2. **Terminal status = `ready`, not `analyzed`.** The plan proposed introducing an `analyzed` status value, but `longform_sources.status` is a free text column whose documented states (schema comment) are `pending|downloading|analyzing|ready|failed` — Plan 07-01 owns the schema. I kept the terminal state as `ready` and recorded `candidateCount` on the `jobs.result` JSON so the UI can distinguish "downloaded but not analyzed" (`ready` with zero candidates) from "analyzed" (`ready` with candidates).
3. **New helper `src/lib/video/longform-storage.ts`.** The plan referenced `downloadLongformSource` as if it already existed. It did not, and Plan 07-02's committed `ytdlp.ts` does not export it. I added a small, dedicated helper file so I would not touch 07-02's code.
4. **`transcript.source` value.** Schema type is `'youtube-transcript' | 'gemini-audio'`; `TranscriptResult.source` is `'youtube-transcript' | 'google-stt'`. In the transcript-mode write I hard-coded `source: 'youtube-transcript'` (the only value we actually reach in this branch) to satisfy the schema.

## Acceptance Criteria

- [x] `AIProvider` declares optional `generateJsonFromAudio` and `generateTextWithModel` — `src/lib/ai/types.ts`
- [x] Gemini provider implements both methods via `GoogleAIFileManager` + `gemini-2.5-pro`
- [x] OpenAI provider throws descriptive errors for the new methods
- [x] `analyze-prompt.ts` exports `LONGFORM_SYSTEM_INSTRUCTION`, `buildTranscriptPrompt`, `buildAudioPrompt`
- [x] `segment-validator.ts` clamps scores 0-100, enforces 30-60s per segment, greedy non-overlap by total score
- [x] `extract-audio.ts` uses `child_process.spawn("ffmpeg", …)` (no fluent-ffmpeg)
- [x] `longform-analyze.ts` picks transcript vs audio automatically, writes all candidates in one insert, transitions source through `ready → analyzing → ready` (or `failed`)
- [x] `bunx vitest run` passes with 269 tests
- [x] `bunx tsc --noEmit` clean except pre-existing issues

## Concerns

- **Gemini Files API quota / ACTIVE poll timeout** is hard-capped at 120s. Very long audio (close to the 4-hour cap) may hit this. Monitor in production and extend if needed.
- **`longform_sources.status` has no `analyzed` state.** The UI will need to infer analysis completion by querying `longform_candidates`. If that's inconvenient, a follow-up migration can introduce `analyzed` as a distinct status.
- **No integration test.** Handler tests mock Gemini entirely. A manual run against a real source (YouTube URL with captions) is recommended before enabling analyze in the UI.

## Unblocks

- **Plan 07-04** (longform-clip job) can now read `longform_candidates` rows written by this handler.
- **Plan 07-05** (UI) can wire the "Analyze" button once the POST route (Task 8 deviation) lands.
