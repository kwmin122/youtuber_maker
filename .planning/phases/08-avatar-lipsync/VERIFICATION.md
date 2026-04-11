# Phase 8 Verification

**Status**: FAIL
**Verified**: 2026-04-11
**Test state**: 411 passing / 2 skipped (413 total), 8 typecheck errors (pre-existing baseline — unchanged)

## TL;DR

Phase 8 built almost every piece — schema, presets API, reference upload/consent, provider clients, worker handler, filter graph overlay, UI sub-tab, RTL tests — but **three load-bearing wires are missing or broken**, so the phase does NOT deliver the promised end-to-end user story:

1. **The export pipeline never forwards `avatarVideoUrl` / `avatarLayout` from the DB to the `ExportScene` objects** (`src/worker/handlers/export-video.ts` lines 65–76). As a result, `buildFullFilterGraph` always sees `undefined` avatar fields, the overlay step is skipped, and the final rendered shorts file has **no avatar visible** — directly breaking Phase Exit Criterion #7 and the phase goal.
2. **Regeneration is a no-op.** The handler’s idempotency gate (`generate-avatar-lipsync.ts` lines 109–119) short-circuits whenever `avatarVideoUrl && avatarProviderTaskId` are set, returning the cached URL. The UI’s "재생성" button (`avatar-scene-list.tsx` lines 65–75) POSTs a job without first clearing those columns, so a second enqueue always returns `skipped: true` — breaking Exit Criterion #8.
3. **HeyGen→D-ID fallback only works for a specific failure mode.** `tryProvider` catches nothing thrown by `generateLipsyncJob` (line 223); on a 429 / 5xx / network error the HeyGen client throws, `tryProvider` itself throws, and the D-ID branch in `handleGenerateAvatarLipsync` line 243 is never reached — partially breaking Exit Criterion #5.

These three bugs form a single chain: the phase’s stated goal ("Export produces final shorts with avatar visible in designated layout") is not satisfied even on the happy path. Tests pass because the handler unit tests and the real-ffmpeg integration test both bypass `export-video.ts` entirely; the integration test builds an `ExportRequest` by hand with avatar fields populated, so it never exercises the broken DB→ExportScene mapping.

## Exit Criteria Coverage

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | User can browse avatar library (12+ curated presets) | ✓ | `src/lib/avatar/curated-fallback.ts` has exactly 12 entries (6 HeyGen + 6 D-ID); `src/app/api/avatar/presets/route.ts` lists them with gender/ageGroup/style filters |
| 2 | User can upload reference photo with consent flow | ✓ | `src/app/api/avatar/assets/upload-url/route.ts`; `src/app/api/avatar/assets/route.ts` requires `consent: z.literal(true)`; `src/components/project/avatar-consent-modal.tsx` has the three Korean legal strings |
| 3 | User selects avatar per-scene or project-wide | ✓ | `src/app/api/scenes/[id]/avatar/route.ts` PATCH + `src/app/api/projects/[id]/default-avatar/route.ts` PATCH, both with IDOR guards; wired in `avatar-sub-tab.tsx` + `avatar-scene-list.tsx` |
| 4 | Clicking "Generate" enqueues N jobs | ✓ | `avatar-sub-tab.tsx` lines 82–92 loops scenes and POSTs to `/api/jobs` with `type: "generate-avatar-lipsync"` |
| 5 | HeyGen primary + D-ID fallback both work | ✗ | `generate-avatar-lipsync.ts` lines 223–234 only returns `null` if `waitForCompletion` reports `status: "failed"` — a thrown 429 from `generateLipsyncJob` escapes `tryProvider` and prevents the D-ID branch at line 243 from ever running. The handler test (`generate-avatar-lipsync.test.ts` case 5) only mocks the "task returned failed" path |
| 6 | Avatar videos composited as PIP overlay via FFmpeg | △ | `ffmpeg-filter-graph.ts` `buildAvatarOverlayFilters` + `buildFullFilterGraph` lines 362–377 build a correct filter graph when given avatar inputs, and `avatar-overlay-ffmpeg.integration.test.ts` verifies FFmpeg accepts the graph. **But** see #7 — the real export path never feeds avatar inputs in |
| 7 | Export produces final shorts with avatar visible | ✗ | **CRITICAL WIRING GAP:** `src/worker/handlers/export-video.ts` lines 65–76 constructs `ExportScene` objects that never include `scene.avatarVideoUrl` or `scene.avatarLayout`. `grep avatarVideoUrl src/worker/handlers/export-video.ts` returns zero matches. Consequently `buildFullFilterGraph` sees `avatarScenes = []`, no overlay filters are emitted, and `exportVideo` downloads zero avatar files |
| 8 | Regeneration replaces old avatar cleanly | ✗ | `generate-avatar-lipsync.ts` lines 109–119 short-circuits when `avatarVideoUrl && avatarProviderTaskId` are set; `avatar-scene-list.tsx` line 65–75 `handleRegenerate` does not clear those fields before POSTing. Net effect: second click = cached URL, no provider call, no replacement |
| 9 | Cost estimate shown before batch | △ | `avatar-sub-tab.tsx` lines 63–68 computes heygen/did $ from totalMinutes and shows `AvatarCostBanner`; but the confirm() guard at line 71 only fires when totalMinutes > 5 (not when total cost > $5 as CONTEXT.md D-13 specifies — 5 min of HeyGen = $5.00, so roughly equivalent, but the threshold units don't literally match the spec) |
| 10 | Tests pass, typecheck clean, lint clean | △ | 411 passing, 2 skipped. Typecheck: 8 pre-existing errors unchanged — OK vs. the allowed baseline, but the project still carries the same 8-error debt. Lint not re-run in this verification |

**Score: 5 pass, 2 warn, 3 fail** (including 2 of the 3 CRITICAL fails on the two criteria closest to the phase goal — export + regeneration).

## Layer 1-5 Findings

### Layer 1: Acceptance Criteria
- All infra and UI pieces exist. The schema, bucket, RLS, presets API, reference upload flow, handler, filter graph, and UI sub-tab are all present and individually correct.
- The failure is not in any one piece — it's in the seam between the handler's output (which writes `scenes.avatarVideoUrl`) and the export pipeline's consumption (which ignores it).

### Layer 2: Goal-Backward Trace
User story: **project Media tab → pick avatar → generate → export → shorts with avatar overlay**.

| Step | Code path | Working? |
|------|-----------|----------|
| 1. Open Media tab | `scene-tab.tsx` renders `<Tabs>` with 4 sub-tabs; avatar tab = `<AvatarSubTab>` | ✓ |
| 2. Fetch library | `avatar-sub-tab.tsx` line 55 → `GET /api/avatar/presets` → `avatar_presets` (seeded from curated-fallback) | ✓ |
| 3. Pick avatar | `handlePresetChange` → `PATCH /api/scenes/[id]/avatar` (ownership-joined) | ✓ |
| 4. Click Generate | `generateAll` → loop → `POST /api/jobs {type: generate-avatar-lipsync}` | ✓ |
| 5. Worker runs handler | BullMQ → `processor.ts` → `handleGenerateAvatarLipsync` → HeyGen/D-ID → `uploadAvatarVideoFromPath` → `UPDATE scenes SET avatarVideoUrl=... avatarProviderTaskId=...` | ✓ (happy path, with caveats on fallback) |
| 6. **Export reads `avatarVideoUrl`** | `export-video.ts` lines 49–76 loads `sceneRows` via `SELECT * FROM scenes`, but the `exportScenes.push({...})` object literal **omits avatar fields entirely** | **✗** |
| 7. Filter graph emits overlay | `buildFullFilterGraph` sees no scene with `avatarVideoUrl` → `avatarScenes.length === 0` → no overlay filters → output is just base scenes | ✗ (downstream of 6) |
| 8. Final MP4 has avatar visible | Nothing was overlaid → avatar invisible in output | **✗** |

**The chain breaks at step 6.** The entire phase's value proposition hinges on a single missing object-spread in `export-video.ts`.

### Layer 3: Cross-Cutting Rules
1. **CAS via `.returning().length`**: ✓ `generate-avatar-lipsync.ts` lines 57–65 — correct pattern.
2. **IDOR defense-in-depth**:
   - `scenes/[id]/avatar/route.ts`: ✓ lines 52–68 (scenes→scripts→projects join)
   - `projects/[id]/default-avatar/route.ts`: ✓ lines 33–44
   - `avatar/scene-progress/route.ts`: ✓ lines 26–37
   - `avatar/assets/route.ts` POST: ✓ line 47 (storagePath prefix check)
   - `avatar/assets/[id]/route.ts` DELETE: ✓ lines 26–28
   - `avatar/presets/route.ts`: ✓ OR filter scoped to caller user
   - `avatar/assets/upload-url/route.ts`: ✓ session-gated, paths scoped via storage helper
   - **`/api/jobs` POST**: ✗ **HIGH** — lines 64–89 only run the ownership pre-check for `type.startsWith("longform-")`. For `generate-avatar-lipsync`, any authenticated user can enqueue a job against another user's `sceneId` in the payload. The worker handler catches this (line 100–102) AFTER the job row has been created and BullMQ has dispatched, so no external cost is incurred, but (a) attacker creates noise jobs in their own jobs table against valid sceneIds, (b) PLANS.md rule 4 is violated ("BEFORE any DB mutation"). Note: this bug predates Phase 8 and is the same shape as Codex CRITICAL-2 from Phase 7 retry 2 — the fix was scoped only to `longform-*`.
3. **Private `avatar-references` bucket**: ✓ `supabase/migrations/avatar_references_bucket.sql` line 9 `public: false`.
4. **Streaming I/O**: ✓ on writes — `avatar-video-storage.ts`, `avatar-reference-storage.ts` use signed-URL PUT with `createReadStream + duplex: 'half'`. ✗ partial — `generate-avatar-lipsync.ts` line 152 uses `Buffer.from(await audioRes.arrayBuffer())` to stage the TTS MP3. Small (few MB), low risk, flagging as LOW.
5. **Idempotency check BEFORE side effects**: ✓ line 109 (but see Layer 5 regeneration note — this gate is *too strict*).
6. **Service-role Supabase client**: ✓ storage helpers consistently use `getServiceRoleClient()`.
7. **Real-ffmpeg integration test for filter graph**: ✓ `avatar-overlay-ffmpeg.integration.test.ts` present and passing. **BUT** it only tests the pure builder function with a synthetic `ExportRequest` — it does not cover the DB→`ExportScene` mapping, which is where the real bug lives.
8. **Job type registered in two places**: ✓ `jobs/route.ts` `ALLOWED_JOB_TYPES` line 24 and processor (verified indirectly by test mocks).
9. **No plaintext provider keys in BullMQ payload**: ✓ `getUserAvatarProvider` resolves keys inside the handler.
10. **No fluent-ffmpeg**: ✓ `child_process.spawn` only throughout.

### Layer 4: Integration Soundness
- **scene-tab refactor preserves v1 tests**: ✓ 393 → 411 baseline holds. BUT the new `image` / `video` / `audio` sub-tabs all render the identical `sceneList` — i.e., clicking between them shows the same content. This is a UX smell (sub-tabs that don't sub-divide anything) but not a functional regression. Flag as MEDIUM UX.
- **`buildAvatarOverlayFilters` input indexing**: ✓ Filter graph: `avatarBaseIndex = scenes.length + narrCountForAvatar + audioTracks.length`, then `inputIndex = avatarBaseIndex + i` where `i` counts scenes in `sceneConfigs` filter order. Export handler: appends avatar files in the same order (`request.scenes.filter(...)` at line 121). **The contract is internally consistent — it just never gets exercised because `request.scenes` never has `avatarVideoUrl` populated by the handler.**
- **scene-progress returns latest per scene**: ✓ ASC order + overwrite-by-sceneId map in `scene-progress/route.ts` lines 56–64. Equivalent to a LATERAL JOIN and simpler.
- **Handler TTS-ready guard**: ✓ lines 122–131 select the audio `media_asset` row and throw if `status !== 'completed'`.

### Layer 5: Edge Cases

**a) HeyGen 429 + D-ID 429**
- **BUG — HIGH**. `heygen-client.ts` line 83 throws on any non-OK HTTP status. `tryProvider` at line 223 does not wrap this call, so HeyGen's throw escapes and bypasses the D-ID fallback at line 243. The job is marked failed with a HeyGen-specific error message. The test at case 5 only covers the `status: "failed"` task response path, not the thrown exception path, so this slipped through.
- Fix: wrap lines 213–234 in `try { ... } catch (e) { console.warn(...); return null; }`.

**b) Same reference photo uploaded twice (same sha256)**
- **Works correctly.** `avatar/assets/route.ts` lines 77–95 look up `(userId, imageHash)`, delete the freshly-uploaded duplicate object, and return `{id: existing.id, deduped: true}` with HTTP 200. Not a 500. ✓

**c) Job downloads corrupted / zero-byte avatar video**
- Partially handled. `probeDurationSeconds` at lines 354–374 rejects on non-zero exit with stderr content, and the outer catch at line 325 marks the job failed + writes a `failed` event. Not "graceful degradation" (no retry, no cleanup of the bad upload), but the job fails cleanly. Acceptable.

**d) Longform-clip scene + avatar overlay in export**
- **Broken as a consequence of bug #1.** The filter graph would handle it correctly (longform scenes come through `create-child-project.ts` with their trimmed `media_asset` as the base visual, and the avatar overlay would composite on top just like an image scene). But since `export-video.ts` never populates `avatarVideoUrl`, the longform + avatar scenario is silently broken along with every other export-with-avatar scenario.
- The `avatar-scene-list.tsx` UI guard modal for longform-clip scenes (lines 148–186) works correctly and gates the selection step, but the export step downstream is broken.

**e) Regeneration with different preset**
- **Broken.** User picks preset A, generates, sees result. Picks preset B, clicks 재생성. `handleRegenerate` POSTs a new job. Handler runs, sees `avatarVideoUrl && avatarProviderTaskId` are both set, returns `skipped: true` without ever reading the (now-changed) `avatarPresetId`. Preset B is never rendered. User sees "완료" but the avatar is still preset A.

## CRITICAL Issues

### C1 — Export pipeline never forwards avatar fields → avatar invisible in final MP4
**File**: `src/worker/handlers/export-video.ts` lines 65–76
**What breaks**: Exit Criterion #7 (the *core promise of Phase 8*). Avatar overlay code in `ffmpeg-filter-graph.ts` is dead code in the real export path.
**Evidence**:
- `grep avatarVideoUrl src/worker/handlers/export-video.ts` → 0 matches
- `src/lib/video/types.ts` lines 62–75 defines `ExportScene.avatarVideoUrl` and `avatarLayout` as optional — the fields exist in the type, the handler just never sets them.
**Fix**: In the `exportScenes.push({...})` literal, add:
```ts
avatarVideoUrl: scene.avatarVideoUrl ?? undefined,
avatarLayout: (scene.avatarLayout as AvatarLayout | null) ?? undefined,
```
**Test gap**: the 08-04 real-ffmpeg integration test constructs an `ExportRequest` directly in-memory with avatar fields populated. It never exercises the `handleExportVideo` → `scene` row → `ExportScene` mapping. A proper integration test should mock the DB and assert that `exportVideo` is called with `request.scenes[i].avatarVideoUrl` populated when the DB row has it.

### C2 — Regeneration is a no-op (idempotency gate is too strict)
**File**: `src/worker/handlers/generate-avatar-lipsync.ts` lines 109–119 combined with `src/components/project/avatar-scene-list.tsx` lines 65–75
**What breaks**: Exit Criterion #8. Once a scene has an `avatarVideoUrl`, no subsequent job can replace it.
**Fix options** (pick one):
1. UI: clear `scenes.avatarVideoUrl` and `avatarProviderTaskId` via `PATCH /api/scenes/[id]/avatar` before enqueueing the regeneration job, then
2. Handler: only short-circuit if `sceneRow.avatarProviderTaskId === job.data.payload.expectedTaskId` (retry-idempotency only, not regeneration), or
3. Add a `regenerate: true` flag to the payload that bypasses the idempotency gate.
**Test gap**: the handler test case 3 ("short-circuits idempotent when avatarVideoUrl already set") *codifies the bug* — it asserts that a second call returns `skipped: true` and the provider is not called. That's exactly the broken behavior we're trying to fix. The regeneration path has no test.

### C3 — HeyGen 429 / network error does not fall back to D-ID
**File**: `src/worker/handlers/generate-avatar-lipsync.ts` lines 204–235 (`tryProvider`)
**What breaks**: Exit Criterion #5 partially. The fallback only works when HeyGen successfully accepts the job but the task later fails; it does NOT work on submission failure (429, 5xx, auth error, network error).
**Fix**: wrap the submit+poll block in a try/catch that logs and returns `null`:
```ts
try {
  const taskId = await resolved.provider.generateLipsyncJob(req);
  const task = await resolved.provider.waitForCompletion(taskId, { ... });
  if (task.status === "completed" && task.videoUrl) return { taskId, videoUrl: task.videoUrl };
  console.warn(`[${preferred}] task failed: ${task.errorMessage}`);
  return null;
} catch (e) {
  console.warn(`[${preferred}] threw: ${(e as Error).message}`);
  return null;
}
```
**Test gap**: case 5 tests only the `status: "failed"` path, not the thrown-from-submit path.

## HIGH Issues

### H1 — `/api/jobs` POST does not IDOR-check `generate-avatar-lipsync`
**File**: `src/app/api/jobs/route.ts` lines 58–89
**Impact**: Violates PLANS.md cross-cutting rule 4. Any authenticated user can enqueue avatar jobs against any sceneId (worker catches it later, so no cost leak, but the jobs row is created + BullMQ dispatched). Same class of bug as Codex CRITICAL-2 from Phase 7 retry 2, just not fixed for the avatar job type.
**Fix**: extend the pre-check to also handle `generate-avatar-lipsync`:
```ts
if (type === "generate-avatar-lipsync") {
  const sceneId = payload?.sceneId;
  // select scenes -> scripts -> projects; 403 if projects.userId !== session.user.id
}
```

### H2 — UI `generateAll` does not filter scenes by TTS readiness
**File**: `src/components/project/avatar-sub-tab.tsx` lines 70–93
**Impact**: Button enqueues a job for every scene regardless of whether its TTS is ready. The handler’s TTS guard (line 127) catches this and throws, so the job fails cleanly, but the user sees a pile of "failed" jobs in their jobs list with "TTS audio not ready" errors. Poor UX. No client-side pre-check.
**Fix**: fetch `media_assets` for each scene in the Media tab data load, filter the enqueue loop to only scenes with a completed audio asset, and show a banner listing scenes skipped due to missing TTS.

## MEDIUM Issues

### M1 — Sub-tabs `image`/`video`/`audio` all render identical content
**File**: `src/components/project/scene-tab.tsx` lines 218–240
**Impact**: The 4 sub-tabs in the new Tabs layout all show the same `sceneList` for the first 3 (image/video/audio). Clicking between them does nothing. This is the refactor from a single top-level sceneList into a 4-tab layout, but the first 3 tabs were not specialized. No functional regression — the SceneCard still renders image/video/audio sections per card — but the UX is confusing.
**Fix**: either specialize each tab (filter SceneCard to show only the relevant media type) or collapse the first 3 tabs into a single "장면" tab + keep the "아바타" tab.

### M2 — Cost-confirm threshold uses `totalMinutes > 5` instead of `totalCost > $5`
**File**: `src/components/project/avatar-sub-tab.tsx` line 71
**Impact**: CONTEXT.md D-13 specifies "Warn user if total > $5.00 for a single project." The code uses `totalMinutes > 5`, which for HeyGen at $1/min happens to equal $5 exactly but does not track the spec. If HeyGen pricing changes (or the user is on D-ID at $0.10/min where $5 = 50 min), the threshold will be wrong.
**Fix**: `if (Number(estimate.heygen) > 5) { confirm(...) }`.

### M3 — Regenerate UI does not clean up old storage object for different provider
**File**: `src/worker/handlers/generate-avatar-lipsync.ts` line 283 (write to `scenes.avatarVideoUrl`)
**Impact**: After fixing C2 (regeneration), a new job will upload to the same deterministic path (`<userId>/<sceneId>/avatar.mp4`) with `upsert: true`, so the old file gets overwritten — that's fine. But if the user later *deletes* the scene or the avatar entirely, there's no cleanup. Flag as future work.

## LOW Issues

### L1 — TTS MP3 fetch is buffered, not streamed
**File**: `src/worker/handlers/generate-avatar-lipsync.ts` line 152
**Impact**: `Buffer.from(await audioRes.arrayBuffer())` loads the entire TTS file into memory. TTS outputs are small (few MB), so low risk, but PLANS.md rule 5 says "streaming file I/O only — no `readFile` / `arrayBuffer` on large files." Consistency fix.

### L2 — Stub library has only 2 HeyGen entries
**File**: `src/lib/avatar/heygen-client.ts` lines 161–178
**Impact**: If the production BYOK key is empty, the stub library returns only 2 entries, which wouldn't satisfy exit criterion #1 (12+). In practice the seed script uses `curated-fallback.ts` (which has 12) when the provider API is unreachable, and the stub is only hit in tests, so this is not a production issue.

## Final Verdict

**FAIL.** Phase 8 does NOT ship what it promised.

Every individual component works in isolation — schema, upload, consent, presets API, handler, filter graph, UI, polling, tests — and the code quality (CAS pattern, IDOR guards on new routes, streaming uploads, service-role client, real-ffmpeg integration test) is genuinely good. But the most load-bearing seam in the phase (`export-video.ts` → `buildFullFilterGraph`) is missing two lines of avatar field forwarding, and the regeneration flow's idempotency gate + UI combination silently swallows every "재생성" click. A user who runs this phase end-to-end will pick an avatar, click Generate, wait, see "완료" in the UI, click Export, and receive a shorts file with **no avatar in it** — and the regenerate button will never actually do anything. That is the complete opposite of the phase goal.

**Must fix before Phase 9:**
1. **C1** — add `avatarVideoUrl` and `avatarLayout` to the `exportScenes.push({...})` literal in `src/worker/handlers/export-video.ts`, plus a DB-mocked integration test that asserts `exportVideo` is called with avatar fields populated when `scenes.avatarVideoUrl` is set.
2. **C2** — fix the regeneration path (either clear columns in UI before POST, or add a `regenerate: true` bypass, or only short-circuit on provider-task-id match). Add a test for the regeneration happy path.
3. **C3** — wrap `tryProvider`'s submit+poll in a try/catch so 429/network errors from `generateLipsyncJob` fall through to D-ID. Add a test for the thrown-from-submit case.
4. **H1** — extend `/api/jobs` POST ownership pre-check to `generate-avatar-lipsync` (mirror the longform-* branch).

**Should fix:** H2 (client-side TTS readiness filter), M1 (collapse or specialize the dummy sub-tabs), M2 (threshold unit).

**Can defer to Phase 9+:** L1 (streaming TTS fetch), M3 (storage cleanup on scene/avatar delete), the pre-existing 8 typecheck errors.

**Phase 7 verifier lesson applied**: the Phase 7 verifier missed a filter_graph audio labeling bug that Codex caught. This verification walks the filter graph inputs end-to-end and found the export-handler wiring gap in the opposite direction — the filter graph is correct, but nothing calls it with real avatar data. Always trace both the producer AND the consumer of every data seam.
