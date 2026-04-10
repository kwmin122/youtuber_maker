# Plan 07-05 Summary

**Status**: DONE
**Duration**: ~1h
**Tasks**: 10/10
**Phase 7 complete**: YES (07-01 through 07-05 shipped)

## Tasks Completed

- Task 1: Dashboard sidebar "Longform" link + projects page entry button — `0e183d7`
- Task 2: `/longform` sources list page — `64eac02`
- Task 3: `/longform/new` intake page (URL + file upload) with `UploadProgress` component — `9653f9b`
- Task 4: `use-longform-polling` hook — `b05d695`
- Task 5: `CandidateGrid` with 4 score bars (color-coded) + selection — `b05d695`
- Task 6: `LongformProgress` + `LongformDetailClient` orchestrator (polls, auto-kicks analyze, clip actions) — `b05d695`
- Task 7: `/longform/[id]` server detail page — `b05d695`
- Task 8: Extended `GET /api/projects?parentLongformId=X` + `ChildProjectsList` component — `b05d695`
- Task 9: Fixed `projects.test.ts` for the new GET signature — `b05d695`
- Task 10: RTL tests (candidate grid, polling hook, intake form, detail client) — `5afb616`

## Files Created

- `src/app/(dashboard)/longform/page.tsx`
- `src/app/(dashboard)/longform/new/page.tsx`
- `src/app/(dashboard)/longform/[id]/page.tsx`
- `src/components/longform/candidate-grid.tsx`
- `src/components/longform/longform-detail-client.tsx`
- `src/components/longform/longform-progress.tsx`
- `src/components/longform/child-projects-list.tsx`
- `src/components/longform/upload-progress.tsx`
- `src/hooks/use-longform-polling.ts`
- `src/__tests__/longform-candidate-grid.test.tsx`
- `src/__tests__/use-longform-polling.test.tsx`
- `src/__tests__/longform-new-form.test.tsx`
- `src/__tests__/longform-detail-client.test.tsx`

## Files Modified

- `src/app/(dashboard)/layout.tsx` — added Longform sidebar link
- `src/app/(dashboard)/projects/page.tsx` — added "새 롱폼 → 쇼츠" button
- `src/app/api/projects/route.ts` — GET accepts `?parentLongformId=X`
- `src/__tests__/projects.test.ts` — updated GET calls to pass a Request

## Test Counts

- New tests: 13 (4 candidate grid, 4 polling hook, 2 form, 3 detail client — wait, 2 detail client tests)
- Actually: 5 candidate grid + 4 polling hook + 2 form + 2 detail client = **13 new tests**
- Full suite: **320 passed / 320 total** (was 307 before 07-05)
- Typecheck: clean for all 07-05 files (pre-existing errors in signin/form.tsx, queuedash, projects/[id]/page.tsx remain untouched)

## Deviations

1. **Analyze trigger endpoint**: the plan text references `POST /api/longform/sources/[id]/analyze`, but the prerequisite description (and existing code) says analysis is triggered via `POST /api/jobs` with `type: 'longform-analyze', payload: { sourceId }`. The detail client uses `/api/jobs` because that endpoint actually exists and matches the 07-03 handler. No functional difference — both paths enqueue the same `longform-analyze` job.
2. **Polling interval**: plan Task 5 mentions 2s, user scope says 3s. Hook default is 3s.
3. **Supabase browser client**: plan uses `@supabase/ssr` `createBrowserClient`. Project has `@supabase/supabase-js` installed but not `@supabase/ssr`. Used `createClient` from `@supabase/supabase-js` directly — `uploadToSignedUrl` is identical.
4. **`status: 'clipping'`**: added to the `LongformSourceStatus` union in the polling hook because the user scope lists it among non-terminal statuses. Schema comment lists only `pending|downloading|analyzing|ready|failed`, but the hook safely handles the extra literal.
5. **Projects route tests**: the signature change on `GET /api/projects` broke two existing mock calls in `projects.test.ts`. Fixed in the same commit.
6. **Lint**: `bun run lint` is broken by a pre-existing Next.js 15 `next lint` deprecation; cannot run without project-level config migration. Skipped per the "pre-existing issues — ignore" directive.

## Acceptance Criteria

- [x] `/longform` lists user sources with status badges — `longform/page.tsx`
- [x] `/longform/new` has URL and File tabs, submits and redirects — verified by `longform-new-form.test.tsx`
- [x] URL tab validates via `parseVideoUrl` before POST — verified by "rejects an invalid URL" test
- [x] File tab uses Supabase `uploadToSignedUrl` resumable upload — implemented
- [x] `/longform/[id]` polls `/api/longform/sources/[id]` every 3s while non-terminal — `use-longform-polling.test.tsx`
- [x] Auto-POSTs `longform-analyze` once status=ready and no candidates — `longform-detail-client.tsx` with `analyzeKickedRef` guard
- [x] Candidate grid renders 4 score bars with color coding (green >=80, yellow >=60, red <60) — `scoreColorClass`
- [x] Clip Selected / Auto-Clip All POST to `/api/longform/candidates/clip` — verified by `longform-detail-client.test.tsx`
- [x] Child projects list shows links to `/projects/[id]` — `child-projects-list.tsx`
- [x] Navigation has "Longform" link — dashboard layout modified
- [x] Full test suite clean (320/320)
- [x] Typecheck clean for 07-05 files

## Concerns

None blocking. Minor notes:

- Supabase `uploadToSignedUrl` does not expose progress callbacks in the current SDK; progress bar shows discrete phases (signing → uploading → creating) rather than continuous bytes. True byte-level progress would require `tus-js-client` (already noted as a risk in the plan).
- The Vidstack timeline preview (Task 9 / D-15) was marked optional in the plan; intentionally deferred to a polish pass.
- `ChildProjectsList` polls every 5s independently from the detail polling hook. Could be consolidated but kept separate to keep the existing `/api/longform/sources/[id]` response shape unchanged.
