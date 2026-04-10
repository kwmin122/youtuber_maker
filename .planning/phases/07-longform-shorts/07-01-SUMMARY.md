# Plan 07-01 Summary

**Status**: DONE
**Tasks**: 12/12
**Date**: 2026-04-10

## Tasks Completed

| # | Task | Commit |
|---|------|--------|
| 1 | Extend `src/lib/db/schema.ts` with longform tables + scene source columns | `0169c15` |
| 2 | Generate Drizzle migration `drizzle/0001_phase7_longform.sql` | `5993042` |
| 3 | Hand-written RLS policies `supabase/migrations/rls_longform.sql` | `bdefe04` |
| 4 | Supabase Storage bucket bootstrap `supabase/migrations/longform_storage_bucket.sql` | `d126741` |
| 5 | `src/lib/queue-longform.ts` BullMQ helper | `5141e0f` |
| 6 | `src/worker/index.ts` spawn longform worker, SIGTERM closes both | `938529b` |
| 7 | `src/app/api/jobs/route.ts` allowlist + routing to longform queue | `12335e3` |
| 8+9 | Processor switch stubs + 3 handler stub files | `57d9186` |
| 10 | `src/lib/youtube/parse-url.ts` export `parseVideoUrl` | `2bfe72a` |
| 11 | Root `Dockerfile` (ffmpeg + yt-dlp + bun) | `618beef` |
| 12 | `src/__tests__/youtube-parse-video-url.test.ts` (10 cases) | `86a1a1b` |

## Files Created (10)

- `drizzle/0001_phase7_longform.sql`
- `drizzle/meta/0001_snapshot.json`
- `supabase/migrations/rls_longform.sql`
- `supabase/migrations/longform_storage_bucket.sql`
- `src/lib/queue-longform.ts`
- `src/worker/handlers/longform-download.ts`
- `src/worker/handlers/longform-analyze.ts`
- `src/worker/handlers/longform-clip.ts`
- `src/__tests__/youtube-parse-video-url.test.ts`
- `Dockerfile`

## Files Modified (6)

- `src/lib/db/schema.ts` — longform tables, `projects.parent_longform_id`, scenes.source_*
- `src/worker/index.ts` — second Worker + SIGTERM closes both in parallel
- `src/worker/processor.ts` — 3 new case branches
- `src/app/api/jobs/route.ts` — ALLOWED_JOB_TYPES + longform queue routing
- `src/lib/youtube/parse-url.ts` — appended `parseVideoUrl`
- `src/app/api/projects/[id]/scenes/[sceneId]/subtitle/route.ts` — null guard (scriptId nullable fallout)
- `src/app/api/projects/[id]/scenes/[sceneId]/transition/route.ts` — null guard (scriptId nullable fallout)

## Verification

- **Typecheck**: `bunx tsc --noEmit -p tsconfig.json` — clean aside from pre-existing errors in `signin/form.tsx`, `queuedash`, and `projects/[id]/page.tsx` (all confirmed to exist on the base commit before 07-01 started).
- **Tests**: `bunx vitest run` — **213/213 passing across 33 test files**. New file: 10/10 cases in `youtube-parse-video-url.test.ts`.
- **Drizzle generate**: produced one migration file `drizzle/0001_phase7_longform.sql` matching the expected statements (CREATE longform_sources, CREATE longform_candidates, ALTER projects, ALTER scenes).

## Deviations From Plan

1. **scripts.analysisId was NOT made nullable.** The plan mentioned this as a possibility to check; `rg analysisId` showed all writers still pass a non-null analysisId, and the Phase 7 data model only requires `scenes.scriptId` to be nullable (for longform-clip scenes that have no script). Leaving scripts.analysisId as-is avoids widening a column that nothing in Phase 7 needs to be nullable.

2. **`scenes.scriptId` nullable caused two pre-existing ownership helpers to fail typecheck**: `subtitle/route.ts` and `transition/route.ts` do `eq(scripts.id, scene.scriptId)`. Fixed with minimal `if (!scene.scriptId) return null;` guards before the scripts lookup, which matches the existing "scene not found / unauthorized" return path.

3. **Drizzle generate produced a large migration** because Phases 4-6 were added to `schema.ts` without running `db:generate`. The plan explicitly said "If drizzle-kit emits multiple statements, keep them in the generated file unchanged" so I committed the full file. This retroactively aligns the Drizzle journal with the Supabase DB (which was updated out-of-band via `db:push`). No action needed — the migration will be a no-op against a DB that already has those tables.

4. **No `test` npm script** exists in `package.json`. Ran tests via `bunx vitest run` directly. Existing CI/docs may assume a `test` script but that's outside 07-01 scope.

## Acceptance Criteria

- [x] `longformSources` + `longformCandidates` exported from `src/lib/db/schema.ts`
- [x] `projects.parent_longform_id` column exists
- [x] `scenes.source_type` exists, `scenes.scriptId` nullable
- [x] `drizzle/0001_phase7_longform.sql` migration generated
- [x] `supabase/migrations/rls_longform.sql` created
- [x] `supabase/migrations/longform_storage_bucket.sql` created
- [x] `src/lib/queue-longform.ts` with `getLongformQueue()`
- [x] `src/worker/index.ts` spawns two workers, SIGTERM closes both
- [x] `src/app/api/jobs/route.ts` ALLOWED_JOB_TYPES has 3 new types, routes longform-*
- [x] `src/worker/processor.ts` has 3 new case branches
- [x] 3 handler stub files exist and throw "not implemented"
- [x] `parseVideoUrl` exported
- [x] Test file passes (10/10)
- [x] Root Dockerfile exists with ffmpeg + python3 + yt-dlp + bun
- [x] Typecheck clean (modulo pre-existing errors)
- [x] Tests pass (213/213)

## Next Plans Unblocked

- **07-02**: longform-download handler (yt-dlp + Supabase Storage upload + ffprobe)
- **07-03**: longform-analyze handler (transcript + AI candidate scoring)

Both can start immediately. 07-04 (longform-clip) depends on 07-02 + 07-03 landing.
