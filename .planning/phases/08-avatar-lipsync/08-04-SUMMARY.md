# Plan 08-04 Summary

**Status**: DONE
**Duration**: ~90 minutes
**Tasks**: 5/5 Parts complete (A through E)

## Tasks Completed

- Part A: Audio conversion + avatar video storage ✅ `bae36ed`
- Part B: Full lipsync handler ✅ `3f805f3`
- Part C: Filter graph overlay layer + export wiring ✅ `8404860`
- Part D+E: Tests (handler unit + real-ffmpeg integration) ✅ `25c0dfb`

## Files Created

| File | Status |
|------|--------|
| `src/lib/video/audio-convert.ts` | NEW |
| `src/lib/media/avatar-video-storage.ts` | NEW |
| `src/worker/handlers/generate-avatar-lipsync.ts` | REPLACED stub |
| `src/__tests__/generate-avatar-lipsync.test.ts` | NEW |
| `src/__tests__/avatar-overlay-ffmpeg.integration.test.ts` | NEW |

## Files Modified

| File | Change |
|------|--------|
| `src/lib/video/types.ts` | Added `AvatarLayout`, `AvatarPosition`, avatar fields to `ExportScene` + `SceneFilterConfig` |
| `src/lib/video/ffmpeg-filter-graph.ts` | Added `buildAvatarOverlayFilters`, `AvatarOverlaySpec`; updated `buildTransitionFilters` (labelOverrides param); wired overlay into `buildFullFilterGraph` |
| `src/lib/video/ffmpeg-export.ts` | Added avatar video download + ffmpeg input wiring (input ordering contract: [scenes][narrations][bgms][avatars]) |

## Test Counts

- Before: 382 tests (2 skipped)
- After: 393 tests (2 skipped)
- New tests: 11 (+7 handler unit, +4 real-ffmpeg integration)

## Typecheck Status

- Pre-existing errors: 8 (all in UI files, unrelated to this plan)
- New errors from this plan: 0
- Total: 8 (within the allowed baseline)

## Real-FFmpeg Integration Test

**Present and passing** on this machine (ffmpeg 6.1.1 via Anaconda):
- `builds a graph that ffmpeg accepts — scene with avatar PIP overlay` ✅ (exit 0, ~136ms)
- `falls back to v1 behavior when no scene has avatar (regression guard)` ✅ (exit 0, ~90ms)
- `buildAvatarOverlayFilters produces correct label overrides for all positions` ✅
- `disabled avatar layout is skipped (no filters emitted)` ✅
- Fallback `skipped` test correctly skipped (ffmpeg IS on PATH)

## Regression Check Results

Phase 7 longform-clip filter graph tests: **all green**

Full `bunx vitest run` result:
```
Test Files  58 passed (58)
Tests       393 passed | 2 skipped (395)
```

The two previously existing real-ffmpeg integration tests in `ffmpeg-filter-graph-integration.test.ts` (longform-clip + v1 multi-scene image) both pass with no regressions.

## All PLANS.md Rules Verified

1. CAS via `.returning().length` — handler line 55 ✅
2. Service-role client — avatar-video-storage.ts + WAV staging ✅
3. Private bucket — not modified (08-01 scope) ✅
4. Ownership check BEFORE external calls — handler lines 63-95 ✅
5. Streaming file I/O — createReadStream+duplex:'half' in storage, pipeline in download ✅
6. `upsert: true` on signed upload URL — avatar-video-storage.ts line 36 ✅
7. Idempotency BEFORE provider submit — handler lines 97-104 ✅
8. Real ffmpeg integration test — present and passing ✅
9. Job type in two places — already done in 08-01 ✅
10. try/catch with job_events failure row + finally cleanup ✅
11. No plaintext keys in payload — getUserAvatarProvider resolves keys inside handler ✅
12. No fluent-ffmpeg — child_process.spawn only ✅
13. Drizzle migrations — not modified (schema locked in 08-01) ✅
14. Tests under src/__tests__/ — correct naming convention ✅

## Deviations from Plan

1. **WAV staging bucket**: Plan noted a possible issue with `avatar-references` rejecting audio MIME types. The handler uses `generated-media` bucket inline for WAV staging (as the plan's note suggested). No architectural change required.
2. **`createAvatarReferenceDownloadUrl` import**: The plan stub in Task 3 had an unused import of this function. The final handler does not import it (WAV is staged in `generated-media` directly).
3. **Test mock complexity**: The `mockImplementation` for `spawn` required `_rest: any[]` to satisfy TypeScript's `SpawnOptions` overload signature. Used `// eslint-disable-next-line @typescript-eslint/no-explicit-any` which is acceptable in test files.

## Unblocks

**Plan 08-05** (UI — Avatar Sub-Tab + Generate Flow) is now fully unblocked:
- `generate-avatar-lipsync` job is fully implemented and idempotent
- `buildFullFilterGraph` composes avatar overlay when `avatarVideoUrl` + `avatarLayout.enabled` are set
- `export-video` handler correctly downloads and passes avatar video files
- All 5 layout positions supported: `bottom-right`, `bottom-left`, `top-right`, `center`, `fullscreen`
- Handler returns `{ sceneId, avatarVideoUrl, skipped }` — UI can poll job progress and detect completion
