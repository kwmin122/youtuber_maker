# Phase 7: Long-form to Shorts — Plan Index

**Phase**: 7 — Long-form to Shorts Clipping
**Requirement**: CORE-07
**Status**: Plans drafted, ready for execution
**Context**: `./CONTEXT.md` (15 resolved decisions D-01 through D-15)
**Assumptions**: `./ASSUMPTIONS.md`

## Goal

A user pastes a long YouTube URL (or uploads a 2 GB mp4/mov/webm/mkv file), the worker downloads and analyzes it with Gemini 2.5 Pro (transcript or audio mode), produces 5-10 viral-scored candidate segments, and after user selection clips each into a 9:16 1080x1920 MP4 that becomes a child project flowing through the existing v1 editing/distribution pipeline.

## Plan List

| # | Plan | Wave | Depends on | Blast radius | Summary |
|---|------|------|------------|--------------|---------|
| 07-01 | Schema + Infrastructure | 1 | — | medium | Drizzle migration (longform_sources, longform_candidates, scenes/projects extensions), yt-dlp install in Railway Dockerfile, longform-queue BullMQ setup, ALLOWED_JOB_TYPES allowlist, RLS, storage bucket, URL parser extension. |
| 07-02 | Download Job + Upload API | 2 | 07-01 | medium | `longform-download` job handler spawning yt-dlp, file upload API route for direct Supabase resumable uploads, metadata extraction (duration, title), duration bounds validation (120-14400s). |
| 07-03 | Analysis Job + Gemini Integration | 2 | 07-01 | medium | `longform-analyze` job handler with two modes: transcript (reuse youtube-transcript) and audio (Gemini Files API). Segment extraction prompt, 4-score viral rating per candidate, candidates written to `longform_candidates`. |
| 07-04 | Clip Job + Child Project Generation | 3 | 07-01, 07-02, 07-03 | large | `longform-clip` job handler spawning FFmpeg with 9:16 crop filter, disk preflight, tmp cleanup, creates child `projects` row per candidate with synthetic `scripts`/`scenes`/`media_assets` rows so v1 pipeline can consume the clip. |
| 07-05 | UI — Longform Flow + Candidate Grid | 4 | 07-01, 07-02, 07-03, 07-04 | medium | New "Longform" dashboard route with URL/file entry form, realtime progress panel subscribed to `jobs` channel, candidate card grid (4 score bars + reason + Vidstack timeline markers), selection + "Clip to Shorts" + "Auto-clip all" actions, child-project list. |

## Wave Execution

```
Wave 1: [07-01]                        // schema + infra first (everything else depends)
Wave 2: [07-02, 07-03]                 // download and analyze can be built in parallel
Wave 3: [07-04]                        // clip uses download output + candidates
Wave 4: [07-05]                        // UI ties everything together
```

Within a wave, plans may run in parallel on separate agents. Wave boundaries are hard — a later wave may only start after every plan in the earlier wave has passed its acceptance criteria.

## Cross-Cutting Rules (apply to every plan in this phase)

1. **No fluent-ffmpeg ever.** Use `child_process.spawn` only (CLAUDE.md rule).
2. **No plaintext API keys in BullMQ payloads.** Resolve via `getUserAIClient(userId)` inside the handler, not the payload.
3. **Every worker handler wraps its body in try/catch** that updates `jobs.status='failed'` + inserts a `failed` row into `job_events`, mirroring `src/worker/handlers/export-video.ts`.
4. **Every new job type must be added in two places:** `ALLOWED_JOB_TYPES` in `src/app/api/jobs/route.ts` AND the switch in `src/worker/processor.ts`.
5. **Every new table must have RLS enabled** with a `user_id = auth.uid()` policy, matching `supabase/migrations/rls_jobs.sql` style.
6. **Every tmp file must be cleaned up in a `finally` block** using `rm(tempDir, { recursive: true, force: true })`.
7. **All file paths in plans are relative to the project root** `/Users/min-kyungwook/Desktop/youtuber_min`.
8. **Drizzle migrations are generated via** `bunx drizzle-kit generate` after editing `src/lib/db/schema.ts`. Do not hand-write SQL migrations except for RLS policies.
9. **Tests live under** `src/__tests__/` and follow the `{module-name}.test.ts` convention. Every new handler gets a corresponding `*.test.ts`.
10. **Dashboard pages are served from** `src/app/(dashboard)/<route>/page.tsx` with Server Components by default.

## Phase Exit Criteria (mirrors CONTEXT.md section 136)

- [ ] User can paste a YouTube URL and see candidates in the UI within reasonable time
- [ ] User can upload a mp4/mov/webm/mkv (<=2 GB) file and see candidates in the same flow
- [ ] 5-10 candidates are displayed, each with the four viral scores (hook, emotional, density, trend)
- [ ] Selected candidates clip successfully to 1080x1920 mp4 via FFmpeg
- [ ] Each clip becomes a child project that opens in the v1 workflow tabs and can be exported/uploaded
- [ ] "Auto-clip all" button enqueues a `longform-clip` job for every candidate
- [ ] Transcript mode AND audio (Gemini Files API) mode both work end-to-end
- [ ] All new handlers have unit tests; `bun run test` and `bun run lint` are clean
