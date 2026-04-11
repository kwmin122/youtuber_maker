# Phase 8 Verification

**Status**: PASS
**Verified**: 2026-04-11
**Test state**: 436 passing / 2 skipped (438 total), 8 typecheck errors (pre-existing baseline — unchanged)
**drizzle-kit check**: `Everything's fine`

## TL;DR

Phase 8 (AI Avatar & Lipsync, MEDIA-05) ships after 5 retry rounds. Initial verification found 3 CRITICAL + 1 HIGH bugs, and Codex cold-review uncovered 4 more issues across successive retry rounds. All 8 findings resolved. End-to-end user flow now works: browse library → pick avatar → generate lipsync → export with avatar composited as PIP overlay via FFmpeg.

## Retry History

| Round | Reviewer | Findings | Resolution |
|-------|----------|----------|------------|
| Verify 1 | Opus verifier | C1 (export wiring dead), C2 (regenerate no-op), C3 (HeyGen throw bypass), H1 (IDOR missing) | 4 commits (870f776, 1d5bf7b, b631e6d, 6a9c7eb) + 1 typecheck fix (8dea74c) |
| Codex 1 | Cold review | C2 PARTIAL (data-loss race on POST failure), NEW HIGH (preset change silently skipped) | 2 commits (dd9d8e9, 87d246b) — switched to `regenerate:true` payload flag |
| Codex 2 | Cold review | Scene-level duplicate enqueue unprotected | 2 commits (66b6f8e, 842839d) — SELECT pre-check + UI in-flight guards |
| Codex 3 | Cold review | TOCTOU race in SELECT-then-INSERT, UX leftover on 409 | 2 commits (5925978, a815655) — partial unique index + poll-driven button state |
| Codex 4 | Cold review | drizzle journal missing 0005 entry | 1 commit (a50bcb8) — journal + snapshot registration |

Total: **14 retry commits** across verification loop. All tests green, typecheck baseline preserved at every step.

## Exit Criteria Coverage

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Browse avatar library (12+ curated presets) | ✓ | `src/lib/avatar/curated-fallbacks.ts` (12 entries), `GET /api/avatar/presets` |
| 2 | Upload reference photo with consent flow | ✓ | `avatar-reference-upload.tsx`, `avatar-consent-modal.tsx`, `POST /api/avatar/assets` with consent + sha256 |
| 3 | Select avatar per-scene or project-wide | ✓ | `PATCH /api/scenes/[id]/avatar`, `PATCH /api/projects/[id]/default-avatar` |
| 4 | Click Generate → enqueue N jobs | ✓ | `avatar-sub-tab.tsx` generateAll, `POST /api/jobs` with IDOR + dedupe |
| 5 | HeyGen primary + D-ID fallback | ✓ | `generate-avatar-lipsync.ts` tryProvider wrapped in try/catch (C3 fix) |
| 6 | Avatar composited as PIP overlay via FFmpeg | ✓ | `buildAvatarOverlayFilters` in `ffmpeg-filter-graph.ts`, real-ffmpeg integration test |
| 7 | Export shows avatar in final shorts | ✓ | `export-video.ts:75` forwards `avatarVideoUrl` + `avatarLayout` to ExportScene (C1 fix) |
| 8 | Regeneration replaces cleanly | ✓ | `regenerate:true` payload bypasses gate; worker cleanup deletes old storage object (C2 fix) |
| 9 | Cost estimate before batch | ✓ | `avatar-cost-banner.tsx` + `scenes.duration` sum |
| 10 | Tests green, typecheck clean | ✓ | 436 passing, typecheck 8 baseline, drizzle-kit check passes |

## Key Fixes

**C1 — Export wiring (load-bearing)**: `export-video.ts:75` now includes `avatarVideoUrl: scene.avatarVideoUrl ?? undefined` and `avatarLayout: scene.avatarLayout ?? undefined` in the ExportScene literal. Avatar videos downloaded to temp dir before ffmpeg spawn. Input ordering matches filter graph contract: scenes → narrations → bgms → avatars. New test: `export-video-avatar-wiring.test.ts`.

**C2 — Regeneration (data-safe)**: `generate-avatar-lipsync.ts:121` gate now checks `!payload.regenerate && cached` before skipping. Client passes `regenerate:true` in handleRegenerate + generateAll. No DB mutation before enqueue — POST failure leaves existing avatar intact. Worker cleans up old storage object on successful overwrite.

**C3 — Provider fallback**: `generate-avatar-lipsync.ts:223` wraps `generateLipsyncJob + waitForCompletion` in try/catch. Exceptions from HeyGen (429, network, timeout) return `null` instead of escaping, so D-ID branch executes. Tests: HeyGen throws → D-ID succeeds (7), both throw → handler rejects (8).

**H1 — IDOR on /api/jobs**: Extended pre-check at `route.ts:91` to `generate-avatar-lipsync`. Joins scenes→scripts→projects, returns 403 on cross-user, 400 on missing sceneId. Test: `api-jobs-avatar-idor.test.ts`.

**Concurrent enqueue (atomic)**: Postgres partial unique index `jobs_avatar_dedupe_uniq ON jobs (user_id, (payload->>'sceneId')) WHERE type='generate-avatar-lipsync' AND status IN ('pending','active')`. Pre-check SELECT returns 409 with `existingJobId` (fast path). INSERT wrapped in try/catch with narrow 23505 + constraint name check (race-loser path). Migration registered in drizzle journal.

**Poll-driven UX**: `avatar-scene-list.tsx` reads `useSceneAvatarJobs(projectId).progressMap`. Button `disabled` derives from `serverInFlight(sceneId)` (status pending/active). Local `regeneratingIds` cleared unconditionally in finally — polling hook re-disables within 3s if a real job is running.

## Cross-Cutting Rules Compliance

- **postgres-js CAS** (`.returning().length`): verified in `generate-avatar-lipsync.ts` status transitions
- **IDOR defense-in-depth**: every new mutation route does ownership join before write — `/api/jobs`, `/api/scenes/[id]/avatar`, `/api/projects/[id]/default-avatar`, `/api/avatar/scene-progress`, `/api/avatar/assets/*`, `/api/avatar/presets/refresh`
- **Private buckets**: `avatar-references` + `avatar-videos` both private, service-role client for server writes
- **Streaming I/O**: reference upload uses `createReadStream` + `duplex:'half'` via shared helpers
- **Idempotency before side effects**: handler gate + payload `regenerate` flag + atomic DB constraint
- **Real-ffmpeg integration test**: `avatar-overlay-ffmpeg.integration.test.ts` + `export-video-avatar-wiring.test.ts` cover the full DB→ExportScene→filter graph path

## Test Delta

- Baseline (after Phase 7): 393 passing
- After Phase 8 plans: 411 passing (+18 avatar component + API tests)
- After retry rounds: **436 passing** (+25 verification tests: C1 wiring, C2 regenerate payload, C3 provider fallback, H1 IDOR, dedupe 23505, poll-driven UX)
- 2 skipped unchanged (pre-existing)
- Typecheck: 8 pre-existing errors unchanged (signin/form.tsx, queuedash, projects/[id]/page.tsx)

## Final Verdict

Phase 8 delivers its stated goal. User can produce shorts with an AI avatar composited as PIP overlay, generated via HeyGen (with D-ID fallback), from either a curated library preset or an uploaded reference photo with consent. Concurrency, regeneration, and IDOR are all race-safe. Ready to advance to Phase 9 (Trend Intelligence, DATA-02 + DATA-04).
