# Phase 7: Long-form to Shorts Clipping — Verification

**Verified**: 2026-04-10
**Verdict**: PARTIAL — Criteria 1-3 ship. Criterion 4 ("v1 editing/distribution pipeline unchanged") has a hard failure on export for longform child projects.

## Build / Tests

| Layer | Result |
|---|---|
| `bunx vitest run` | 320/320 passing (48 files) |
| `bunx tsc --noEmit` | No new Phase 7 errors (pre-existing signin/form, queuedash, projects/[id]/page.tsx noted and ignored per baseline) |

## Integration trace (goal-backward)

### Criterion 1 — URL or file → 5-10 candidates detected  ✅
- UI `src/app/(dashboard)/longform/new/page.tsx:44,133` POSTs `/api/longform/sources`.
- `src/app/api/longform/sources/route.ts:85-100` inserts `longform_sources` + `jobs` row AND enqueues directly on `getLongformQueue()`. No double-insert via `/api/jobs`.
- `src/worker/index.ts:22-27` starts a dedicated `longform-queue` Worker with concurrency 2, and `SIGTERM` handler (line 39-43) closes both workers in parallel.
- `src/worker/processor.ts:48-53` dispatches `longform-download`, `longform-analyze`, `longform-clip`.
- Download handler `src/worker/handlers/longform-download.ts` probes → downloads → uploads → `status='ready'` (line 225). File-mode path (`sourceType='file'`) re-downloads from storage purely to run `ffprobe` — OK, and skips re-upload.
- Analyze auto-kicked from detail page `src/components/longform/longform-detail-client.tsx:39-66` once `source.status='ready'` and no candidates. Uses `/api/jobs` with `type='longform-analyze'`, which routes to longform queue via `src/app/api/jobs/route.ts:71-73` (`type.startsWith("longform-")`).

### Criterion 2 — Four viral scores per candidate  ✅
- `longform-analyze.ts:246-259` inserts candidates with `hookScore`, `emotionalScore`, `informationDensity`, `trendScore`. Schema `src/lib/db/schema.ts:103-106` stores them as `integer`. UI `candidate-grid.tsx` reads them.
- Transcript mode (YouTube captions via `fetchTranscript`) and audio mode (Gemini Files API via `generateJsonFromAudio`) both reach the same `parseAndValidateCandidates` sink.
- Analyze sets source back to `status='ready'` after inserting candidates (`longform-analyze.ts:263`). The schema comment at `schema.ts:59` mentions an `analyzed` status but the handler never writes it. Clip route and handler accept both (`ready` | `analyzed`) so this is cosmetic but confusing.

### Criterion 3 — Selected segments auto-clipped to 9:16, injected into scenes  ✅ (creation) / ⚠ (status visibility)
- `src/app/api/longform/candidates/clip/route.ts` accepts `mode: 'selected'|'all'` and enqueues a `longform-clip` job on the longform queue.
- `longform-clip.ts` downloads source once, loops candidates, calls `clipLongform9x16`, uploads clipped MP4 via `uploadLongformClipBuffer`, and invokes `createChildProjectForClip`.
- `src/lib/longform/create-child-project.ts:66-160` wraps projects/scripts/scenes/media_assets writes in a `db.transaction`. Scene row has `sourceType='longform-clip'`, `sourceClipStartMs/EndMs`, `sourceLongformId` set. `media_assets.type='video'` with the uploaded clip URL and `storagePath`.
- GET `/api/projects?parentLongformId=<id>` is supported (`src/app/api/projects/route.ts:56-60`). `ChildProjectsList` polls it every 5s.
- ⚠ `longformSources.status` is never updated to `'clipping'` anywhere in the clip handler. The UI's `longform-detail-client.tsx:107` tests for `status === 'clipping'` to show the progress banner but that status is never reached — clip progress is invisible in the detail view during batch clips.

### Criterion 4 — Child projects flow through v1 editing/distribution pipeline unchanged  ❌ HARD FAILURE

**Blocker in `buildFullFilterGraph` + `buildAudioMixFilter`**:

- `src/worker/handlers/export-video.ts:60-76` collects `mediaAssets` per scene: for a longform-clip child there is exactly one row of `type='video'` (the clipped MP4) and **no `type='audio'` row**. So `scene.audioUrl` is `undefined` for every scene.
- `src/lib/video/ffmpeg-filter-graph.ts:250` → `narrCount = scenes.filter(s => s.audioUrl).length` → `0`.
- `audioTracks` for the child project are empty → `bgmConfigs = []`.
- `buildAudioMixFilter(0, [], ...)` returns `""` at `ffmpeg-filter-graph.ts:171`, so no `[aout]` label is ever declared in the filter graph.
- BUT `buildFullFilterGraph` unconditionally returns `outputMaps: ["[vout]", "[aout]"]` (`ffmpeg-filter-graph.ts:262`).
- FFmpeg invocation in `ffmpeg-export.ts:162` does `args.push("-map", "[aout]")` → FFmpeg fails with `"Stream map '[aout]' matches no streams"` and `export-video` job goes to `failed`.
- **Net effect**: every child project created by Phase 7 will fail to export unless the user manually adds TTS or BGM first. This violates the explicit Phase 7 goal ("Clipped segments flow through v1 editing/distribution pipeline unchanged").

A secondary concern on the same path: even if the audio map were fixed, the clip's own embedded audio is never mapped as an input at all. `export-video.ts` only loops `audioFiles` which come from `scene.audioUrl`. The longform clip's audio (which lives inside the video file) is discarded. For longform shorts the user almost certainly wants the clip's original voice/music, not TTS.

A tertiary concern: `create-child-project.ts:117` sets `scene.duration = (endMs - startMs) / 1000` which can be 60+ seconds. The existing v1 `export-video` happily accepts any duration, but the `buildSceneFilters` path uses `-loop 1 -t 30` for images (not applicable here) — for video inputs, it relies on the scene's `duration` matching the input; any mismatch between declared duration and clipped-file length will truncate or loop.

### Cross-cutting checks

| Check | Result |
|---|---|
| `ALLOWED_JOB_TYPES` contains 3 new types | ✅ `src/app/api/jobs/route.ts:24-26` |
| Processor switch updated | ✅ `src/worker/processor.ts:48-53` |
| Longform queue started in worker entry | ✅ `src/worker/index.ts:22-37` |
| SIGTERM closes both queues | ✅ `src/worker/index.ts:39-43` |
| Longform jobs routed to longform queue via `/api/jobs` | ✅ `src/app/api/jobs/route.ts:71-73` |
| RLS on `longform_sources` + `longform_candidates` | ✅ `supabase/migrations/rls_longform.sql` (4 policies each, `user_id = auth.uid()::text`) |
| tmp cleanup in `finally` | ✅ download/analyze/clip all do `rm(tempDir, { recursive, force })` |
| No plaintext keys in payloads | ✅ Gemini resolved via `getUserAIClient(userId, 'gemini')` inside `longform-analyze.ts:90` |
| `scripts.analysisId` nullable | ✅ `schema.ts:287` has no `.notNull()`, confirmed by comment |
| `scenes.scriptId` still FK-cascade | ✅ `schema.ts:315` |
| Child project `workflowState.currentStep = 4` | ✅ Skips past analysis/script tabs, opens straight to video editor |

### Duplicate file (minor code smell, not a bug)

`src/lib/video/longform-storage.ts` and `src/lib/media/longform-storage.ts` both exist. The former only exports `downloadLongformSource`; the latter exports the full surface (`uploadLongformSource`, `downloadLongformSource`, `getLongformPublicUrl`, `uploadLongformClipBuffer`, `deleteLongformSource`). `longform-analyze.ts:21` imports from `@/lib/video/longform-storage` while `longform-download.ts` and `longform-clip.ts` import from `@/lib/media/longform-storage`. Both paths resolve, both work, but the duplicate should be removed to prevent drift.

## Inherited plan concerns

| Concern | Status |
|---|---|
| Source status cosmetic loop (analyze resets to `ready` rather than introducing `analyzed`) | Still present — handler writes `ready`, UI accepts both |
| Upload OOM risk — worker `readFile` then `upload` a 2 GB buffer | Still present (`longform-download.ts:169-174`, `longform-clip.ts:198`). Would exceed Railway worker memory on large inputs |
| Gemini Files API 120s upload timeout on long audio | Not verified in this pass; `generateJsonFromAudio` is stubbed at interface level |
| Orphaned storage on worker crash mid-download | Present — failure path sets `longform_sources.status='failed'` but does not delete the `longform-sources/<user>/<id>/source.mp4` Storage object |
| Clip handler never flips source to `clipping` | Present — UI progress banner is dead code for clip phase |
| `latestJob` query hardcoded to `longform-download` in `sources/[id]/route.ts:73` | Present — during analyze/clip the UI shows stale download job progress (100%, "download complete") |

## Verdict: PARTIAL — DO NOT SHIP

Criteria 1-3 are wired end-to-end and the schema/RLS/queue/worker plumbing is solid. Criterion 4 has a concrete production-breaking bug on the export path: every longform child project will fail `export-video` because the v1 filter graph emits a `[aout]` output map that does not exist when no TTS/BGM is present, which is exactly the state a freshly-created longform clip starts in. The phase goal ("flows through v1 editing/distribution pipeline unchanged") is therefore not met.

## Top fixes before shipping

1. **CRITICAL — Fix `buildFullFilterGraph` audio output when no narration/BGM** (`src/lib/video/ffmpeg-filter-graph.ts:262` + `src/lib/video/ffmpeg-export.ts:~160`). Either (a) make `outputMaps` conditional on whether an `[aout]` node was actually produced, or (b) generate an audio stream from the clip's own video input (`[0:a]acopy[aout]`) when the scene source is a longform clip. Option (b) is the correct long-term fix because the user wants the clip's original audio in the short.
2. **HIGH — Pass through the longform clip's embedded audio** (`src/lib/longform/create-child-project.ts:132-145`). Either insert a matching `media_assets.type='audio'` row pointing at the same clip URL, or add a new scene flag that tells `buildFullFilterGraph` to map `[N:a]` directly as `[aout]`. Without this, even after fix (1) the exported short will be silent.
3. **MEDIUM — Move large upload/download to streams**. `longform-download.ts:169` and `longform-clip.ts:198` do `readFile(finalPath)` into a Buffer before `supabase.storage.upload(buffer)`. For a 2 GB source this peaks well above Railway's worker memory budget. Replace with `createReadStream` passed into the Supabase upload, or chunked resumable upload.

Secondary (can ship after shipping, but file tickets):
- Delete the duplicate `src/lib/video/longform-storage.ts` (keep `src/lib/media/longform-storage.ts`).
- Update `src/app/api/longform/sources/[id]/route.ts:73` to return the most recent non-terminal job of ANY longform type so the UI progress bar tracks analyze/clip stages.
- Make the clip handler flip `longform_sources.status` to `'clipping'` at start and back to `'ready'` at end so the progress banner actually renders.
- Delete orphan storage object in the download handler's `catch` block when the source row transitions to `failed`.

---

## Retry 1 Fixes (2026-04-10)

**Status**: DONE — all CRITICAL fixes landed, all secondary cleanups landed, full test suite green (328/328, +8 vs baseline), no new tsc errors.

| # | Fix | Commit | Status |
|---|---|---|---|
| 1 | FFmpeg `[aout]` map mismatch for longform-clip scenes — made `outputMaps` conditional on a produced `[aout]` label in `buildFullFilterGraph`. | `c409b1c` | DONE |
| 2 | Stream clip audio into export — `create-child-project.ts` now inserts a matching `media_assets.type='audio'` row pointing at the same clipped mp4, so the v1 export pipeline picks up the clip's embedded AAC as narration. | `c409b1c` | DONE |
| 3 | Streaming upload/download for 2 GB files — new `uploadLongformSourceFromPath`, `downloadLongformSourceToPath`, `uploadLongformClipFromPath` helpers using signed URLs + `createReadStream` with `duplex:'half'`. Both download and clip handlers rewritten. | `51968e5` | DONE |
| 4 | Deduplicate `src/lib/video/longform-storage.ts` — deleted, all imports now point at `src/lib/media/longform-storage.ts`. | `b187c75` | DONE |
| 5 | `longform_sources.status = 'clipping'` transition — clip handler flips to `'clipping'` at start of job, `'ready'` on success and failure. UI progress banner already tested for `'clipping'` so no component change required. | `51968e5` | DONE |
| 6 | `/api/longform/sources/[id]` GET latest job of ANY longform-* type (not hardcoded `longform-download`) via `inArray(jobs.type, LONGFORM_JOB_TYPES)`. | `7da7dfa` | DONE |
| 7 | Align status schema + handler + UI — schema comment updated to enumerate `clipping` and explain why `'analyzed'` is never written (candidates presence encodes that state); legacy `'analyzed'` still tolerated for fwd-compat. | `7da7dfa` | DONE |
| 8 | Orphan-storage cleanup in download handler failure path — track `uploadedPath`, clear after `status='ready'` update succeeds, delete via `deleteLongformSource` in catch. | `51968e5` | DONE |

### Test delta

| | Before | After |
|---|---|---|
| Test files | 48 | 48 |
| Tests | 320 | 328 |

New tests:
- `ffmpeg-filter-graph`: regression + positive case for conditional `[aout]` (+2)
- `create-child-project`: asserts second `type='audio'` media_asset insert, updated insert-count from 4 to 5 (+1)
- `longform-clip-handler`: filePath-based upload, 'clipping' -> 'ready' on success, 'clipping' -> 'ready' on failure (+3)
- `longform-download-handler`: filePath-based upload, orphan-cleanup on post-upload DB failure (+2)

### Verdict after Retry 1: READY TO SHIP

Criterion 4 ("clipped segments flow through v1 editing/distribution pipeline unchanged") is now met end-to-end:
- Longform child project has a scene with both a `type='video'` and `type='audio'` asset pointing at the clipped mp4.
- `export-video.ts` picks up the audio asset as `scene.audioUrl` unchanged.
- `buildFullFilterGraph` emits `[aout]` because `buildAudioMixFilter` sees `narrCount=1`.
- The exported short carries the clip's original voice/music.
- If a user later manually deletes the audio asset, the safety net in `buildFullFilterGraph` drops `[aout]` from `outputMaps` so FFmpeg no longer crashes.
