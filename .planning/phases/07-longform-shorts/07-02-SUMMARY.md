# Plan 07-02 Summary

**Status**: DONE
**Phase**: 7 — Long-form to Shorts Clipping
**Wave**: 2 (parallel with 07-03)
**Tasks**: 9/9
**Test files**: 4 new, 27 new tests, 240/240 full suite green

## Tasks Completed

| # | Task | Commit |
|---|------|--------|
| 1 | `yt-dlp` spawn wrapper (`probeVideoMetadata`, `downloadVideo`) | `77e1ce4` |
| 2 | Duration/MIME/bucket constants + `assertDurationInBounds` | `77e1ce4` |
| 4 | `longform-storage.ts` helpers (upload/download/publicUrl/delete) | `77e1ce4` |
| 3 | `longform-download` worker handler (URL + file paths) | `3cf9b71` |
| 5 | `POST /api/longform/sources` + `GET` list | `0f5b635` |
| 6 | `POST /api/longform/sources/upload-url` | `0f5b635` |
| 7 | `GET /api/longform/sources/[id]` (source + candidates + latestJob) | `0f5b635` |
| 8 | Tests: ytdlp, handler, duration bounds, upload-url route | `377e0d6` |
| 9 | `env.example` Phase 7 runtime note | `b740a15` |

(Interleaved commits from another agent executing 07-03 are present on
main between the 07-02 commits — they do not touch any 07-02 files.)

## Files Created

- `src/lib/video/ytdlp.ts`
- `src/lib/video/longform-constants.ts`
- `src/lib/media/longform-storage.ts`
- `src/app/api/longform/sources/route.ts`
- `src/app/api/longform/sources/upload-url/route.ts`
- `src/app/api/longform/sources/[id]/route.ts`
- `src/__tests__/longform-duration-bounds.test.ts`
- `src/__tests__/ytdlp.test.ts`
- `src/__tests__/longform-download-handler.test.ts`
- `src/__tests__/longform-upload-url-route.test.ts`

## Files Modified

- `src/worker/handlers/longform-download.ts` — stub → full handler
- `env.example` — runtime binary note

## Acceptance Criteria

- [x] `src/lib/video/ytdlp.ts` exports `probeVideoMetadata` and
      `downloadVideo`, both spawn-based, 720p format filter.
- [x] `longform-constants.ts` exports the four constants and
      `assertDurationInBounds`.
- [x] `longform-download.ts` drives `longform_sources.status`
      through `pending → downloading → ready`, with a `try/finally`
      tempdir cleanup and error propagation to both `jobs` and
      `longform_sources` rows.
- [x] `longform-storage.ts` exports `uploadLongformSource`,
      `downloadLongformSource`, `getLongformPublicUrl`, and
      `deleteLongformSource`.
- [x] `POST /api/longform/sources` validates URL via
      `parseVideoUrl`, enforces user-folder ownership for file mode,
      inserts row + job, enqueues on `getLongformQueue()`, returns
      `{ sourceId, jobId }` with 201.
- [x] `POST /api/longform/sources/upload-url` returns a signed
      Supabase upload URL scoped under `<userId>/uploads/<uuid>/…`
      with the filename sanitized.
- [x] `GET /api/longform/sources/[id]` enforces ownership and
      returns `{ source, candidates, latestJob }`.
- [x] `bunx vitest run` passes: 240 / 240.
- [x] `bunx tsc --noEmit` clean for all new files (pre-existing
      errors in `signin/form.tsx`, `queuedash`, `projects/[id]/page`,
      `ViralScoreDisplay` / `ThumbnailGallery` are untouched).

## Deviations

1. **Return type on the handler.** Plan showed a bare `return { sourceId }`;
   I enrich it to `{ sourceId, durationSeconds, title }` so the
   worker dispatcher (and anything watching the BullMQ result) can
   surface the final metadata without a re-query. Backwards
   compatible with the plan.
2. **`latestJob` field on the detail route.** The plan spec said
   `{ source, candidates }`, but the user-facing brief explicitly
   asked for the latest `longform-download` job for UI polling. I
   added it via a Drizzle `sql` JSONB predicate on
   `jobs.payload->>'sourceId'`. The candidates list is still there.
3. **Progress throttling in `downloadVideo`.** The plan parsed every
   `[download]` line; I added a ≥1-point delta guard to avoid
   hammering Postgres/`job_events` with ~hundreds of 0.1% updates.
4. **Filename sanitization in upload-url.** The plan used the raw
   filename verbatim; I strip path separators and non-alphanumerics
   to prevent storage-key injection (`../evil.mp4` etc.). Tests cover
   the sanitizer.
5. **Extra smoke test added (upload-url route).** Plan listed three
   test files; I added a fourth to cover the signed-URL happy path,
   MIME allowlist, 2 GB cap, and error branches.

## Concerns

- **Memory on very large URL downloads.** URL mode currently does
  `readFile(finalPath)` → `Buffer` → `uploadLongformSource`. This
  peaks at ~1 × file size in RAM. For anything approaching the 2 GB
  file cap this will OOM a Railway worker. The plan's "Risks" section
  already notes this as a follow-up (switch to streaming upload);
  flagging it here so 07-04 / 07-05 don't assume it's fixed.
- **`parseVideoUrl` only accepts YouTube.** The URL-mode route rejects
  non-YouTube URLs with a clear 400 ("Not a valid YouTube video URL"),
  matching the plan. If Phase 7 ever wants to support Vimeo / Twitch
  the validator will need to widen.

## Unblocks

- **Plan 07-04 (Clip)** — can now read `longform_sources.storagePath`
  + `publicUrl` and trust that `status='ready'` implies a 720p mp4
  exists at a known S3 / Supabase path. `durationSeconds` is
  guaranteed populated.
- **Plan 07-05 (UI)** — can POST to `/api/longform/sources` for both
  URL and file modes, poll `GET /api/longform/sources/[id]` to drive
  a progress UI from `latestJob.progress` / `.currentStep`, and use
  `POST /api/longform/sources/upload-url` for direct Supabase
  uploads that sidestep Vercel's 4.5 MB body limit.

## Verification Evidence

```
$ bunx vitest run src/__tests__/longform-duration-bounds.test.ts \
                  src/__tests__/ytdlp.test.ts \
                  src/__tests__/longform-download-handler.test.ts \
                  src/__tests__/longform-upload-url-route.test.ts
 Test Files  4 passed (4)
      Tests  27 passed (27)

$ bunx vitest run
 Test Files  37 passed (37)
      Tests  240 passed (240)

$ bunx tsc --noEmit
# clean for all 07-02 files; only pre-existing unrelated errors remain
```
