# Plan 07-04 Summary — Clip Job + Child Project Generation

**Status**: DONE
**Phase**: 7 — Long-form to Shorts Clipping
**Wave**: 3
**Plan**: `.planning/phases/07-longform-shorts/07-04-PLAN.md`
**Tasks**: 8/8 complete
**Tests**: 307/307 passing (269 baseline + 38 new)
**Typecheck**: clean for all 07-04 files (pre-existing errors in
`signin/form.tsx`, `queuedash`, `projects/[id]/page.tsx` unchanged)

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | FFmpeg 9:16 clip helper (`clipLongform9x16`, `buildClipArgs`) | done | f80a65d |
| 2 | Disk preflight (`assertDiskSpaceAvailable`) | done | f80a65d |
| 8 | `scripts.analysisId` nullable + drizzle migration 0002 | done | f80a65d |
| 3 | Child project factory (`createChildProjectForClip`) | done | 3126e35 |
| 4 | `uploadLongformClipBuffer` storage helper | done | 3126e35 |
| 5 | `handleLongformClip` worker handler (full impl, replaces stub) | done | 2a949e9 |
| 6 | `POST /api/longform/candidates/clip` route | done | a09fa26 |
| 7 | Unit tests (4 files, 38 tests) | done | 073f03a |

## Files Created

- `src/lib/video/clip-longform.ts` (112 lines) — exports `buildClipArgs`, `clipLongform9x16`
- `src/lib/video/disk-preflight.ts` (40 lines) — exports `assertDiskSpaceAvailable`
- `src/lib/longform/create-child-project.ts` (149 lines) — exports `createChildProjectForClip`
- `src/app/api/longform/candidates/clip/route.ts` (135 lines)
- `drizzle/0002_phase7_scripts_analysis_nullable.sql`
- `drizzle/meta/0002_snapshot.json`
- `src/__tests__/clip-longform.test.ts` (12 tests)
- `src/__tests__/disk-preflight.test.ts` (6 tests)
- `src/__tests__/create-child-project.test.ts` (8 tests)
- `src/__tests__/longform-clip-handler.test.ts` (12 tests)

## Files Modified

- `src/lib/db/schema.ts` — drop `.notNull()` on `scripts.analysisId`
- `src/lib/media/longform-storage.ts` — add `uploadLongformClipBuffer`
- `src/worker/handlers/longform-clip.ts` — replace stub with full implementation

## Acceptance Criteria

- [x] `clipLongform9x16` spawns FFmpeg with `crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920,fps=30`, `-c:v libx264`, `-c:a aac`, `-movflags +faststart` — verified by `clip-longform.test.ts`
- [x] `assertDiskSpaceAvailable` uses `fs/promises.statfs`, skips on ENOSYS/ENOTSUP — verified by `disk-preflight.test.ts`
- [x] `createChildProjectForClip` runs all 5 writes inside a single `db.transaction` — verified by `create-child-project.test.ts`
- [x] `uploadLongformClipBuffer` writes to the `media` bucket under `<userId>/longform-clips/<candidateId>.mp4`
- [x] Handler downloads source ONCE and loops per candidate — verified by `longform-clip-handler.test.ts` ("downloads source ONCE and clips N times")
- [x] `try/finally` removes tempDir on success AND failure — verified by handler tests
- [x] `longform_candidates.selected` + `childProjectId` updated — verified by factory test
- [x] Child project has full projects + scripts + scenes + media_assets chain compatible with v1 pipeline (scriptId populated, scene has `sourceType='longform-clip'` + `sourceClipStartMs/EndMs` + `sourceLongformId`)
- [x] `scripts.analysisId` is nullable with migration 0002
- [x] `POST /api/longform/candidates/clip` supports both `mode:'selected'` and `mode:'all'`, enforces ownership via compound WHERE
- [x] BullMQ `job.updateProgress()` called at milestones (2 / 5 / per-candidate / 100)
- [x] Full test suite green: 307/307

## Deviations

1. **Source status check: `'ready'` instead of `'analyzed'`.** Plan 07-04 specified verifying `source.status === 'analyzed'`, but inspection of `src/worker/handlers/longform-analyze.ts` (from Plan 07-03) shows the analyze handler sets the source back to `status='ready'` after a successful analysis run — there is no `'analyzed'` state in the current lifecycle. The handler and API route accept both `'ready'` and `'analyzed'` for forward-compat, but the real state today is `'ready'`. No downstream impact since the check is purely defensive.

2. **Schema migration generated via `drizzle-kit generate`** rather than hand-written. This is the correct workflow for this repo (drizzle.config.ts present, existing migrations in `/drizzle/`). Generated file is a single `ALTER TABLE scripts ALTER COLUMN analysis_id DROP NOT NULL;` statement plus updated `_journal.json` and `0002_snapshot.json`.

3. **`createChildProjectForClip` accepts an optional `dbInstance` parameter** (defaults to the real `db`) so tests can inject a mock without requiring deep vitest module mocking of `@/lib/db`. Does not change the production call site.

4. **API route additionally validates** that every supplied `candidateId` belongs to the source (defense-in-depth; the worker also re-validates via `inArray` + compound WHERE). This catches client bugs earlier and returns a 400 instead of a worker error.

## Concerns

None blocking. Two follow-up thoughts for Plan 07-05 / 07-06:

- **Orphan storage objects**: if the handler crashes between `uploadLongformClipBuffer` and `createChildProjectForClip`, a clip mp4 will sit in Storage without a DB reference. Low impact for MVP (flat path, stable name, upsert:true on retry) — a janitor job can sweep later.
- **Status lifecycle**: the fact that sources cycle back to `'ready'` after analysis is confusing. A future refactor could introduce an explicit `'analyzed'` state for clarity, but that's out of scope here.

## Unblocks

- **Plan 07-05 (UI)** — the API route `POST /api/longform/candidates/clip` and the full clip → child project pipeline are ready to be driven from the longform analysis UI. Selecting candidates and hitting "Clip selected" or "Auto-clip all" now produces usable child projects in the existing v1 workflow.

## Verification Evidence

```
$ bunx vitest run
 Test Files  44 passed (44)
      Tests  307 passed (307)
   Duration  3.96s

$ bunx vitest run src/__tests__/clip-longform.test.ts \
                  src/__tests__/disk-preflight.test.ts \
                  src/__tests__/create-child-project.test.ts \
                  src/__tests__/longform-clip-handler.test.ts
 Test Files  4 passed (4)
      Tests  38 passed (38)

$ bunx tsc --noEmit   # only pre-existing errors in ignored files
  (no errors in any 07-04 file)
```

## Commit Log

```
073f03a test(07-04): add 38 unit tests for clip pipeline
a09fa26 feat(07-04): add POST /api/longform/candidates/clip route
2a949e9 feat(07-04): implement longform-clip worker handler
3126e35 feat(07-04): add child project factory + clip upload helper
f80a65d feat(07-04): add clip helper, disk preflight, and nullable analysisId
```
