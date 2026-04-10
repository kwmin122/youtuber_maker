# Phase 8: AI Avatar & Lipsync — Plan Index

**Phase**: 8 — AI Avatar & Lipsync
**Requirement**: MEDIA-05
**Status**: Plans drafted, ready for execution
**Context**: `./CONTEXT.md` (16 resolved decisions D-01 through D-16)

## Goal

유저가 얼굴 노출 없이 AI 아바타(curated library 또는 참조 사진 업로드)에 대본을 립싱크시켜 "출연자 있는" 쇼츠를 제작한다. HeyGen이 1차, D-ID가 fallback. 생성된 아바타 영상은 기존 v1 Phase 4 배경 장면(Kling 영상 / DALL-E 이미지) 위에 FFmpeg `overlay` 필터로 PIP 합성되어 최종 쇼츠로 export된다.

## Plan List

| # | Plan | Wave | Depends on | Blast radius | Summary |
|---|------|------|------------|--------------|---------|
| 08-01 | Schema + Infrastructure + Provider Interface | 1 | — | medium | Drizzle migration (`avatar_presets`, `avatar_assets`, scenes + projects extensions), hand-written RLS, Supabase Storage bucket `avatar-references` (PRIVATE, 20 MB, image MIME whitelist), shared `AvatarLipsyncProvider` interface, HeyGen + D-ID REST clients, BYOK-aware factory, `generate-avatar-lipsync` added to `ALLOWED_JOB_TYPES`, processor switch + handler stub. |
| 08-02 | Seed Script + Library API | 2 | 08-01 | small | `scripts/seed-avatar-library.ts` imports 12-24 curated HeyGen + D-ID avatars (via admin BYOK keys) into `avatar_presets` with `userId IS NULL`, `GET /api/avatar/presets` filter/list API (returns global presets + the caller's custom rows), `POST /api/avatar/presets/refresh` admin re-seed endpoint, curated code-level fallback list for when provider APIs rate-limit, tests. |
| 08-03 | Reference Image Upload + Consent | 2 | 08-01 | medium | `POST /api/avatar/assets/upload-url` (signed URL, `upsert: true`, path scoped to `<userId>/<uuid>.ext`), `POST /api/avatar/assets` create row with NOT NULL `consentRecordedAt`, `DELETE /api/avatar/assets/:id` with ownership check + cascade, image MIME/size validation, SHA-256 hash dedupe, consent modal component (copies `voice-profile-manager.tsx` pattern with Korean legal text), tests. |
| 08-04 | Lipsync Generation Job + Compositing | 3 | 08-01 | large | Full `generate-avatar-lipsync` worker handler (ownership check → CAS `.returning().length` → TTS guard → MP3→WAV 16kHz conversion → HeyGen submit/poll → D-ID automatic fallback → streaming download & upload → ffprobe `scenes.duration` resync → idempotent `scenes.avatarVideoUrl` / `avatarProviderTaskId` update), extend `ffmpeg-filter-graph.ts` with per-scene overlay layer that emits `[bg][avatar]overlay=…[vout]`, real-ffmpeg integration test for the overlay code path, unit tests for handler (mocked providers) + fallback + format conversion. |
| 08-05 | UI — Avatar Sub-Tab + Generate Flow | 4 | 08-01, 08-02, 08-03, 08-04 | medium | Restructure existing Media tab into 4 sub-tabs (`Image | Video | Audio | Avatar`), avatar library grid with gender/age/style filters, consent-gated reference-photo upload, per-scene avatar override + layout picker (bottom-right / center / top-right / fullscreen), project-wide default avatar selector, "Generate for All Scenes" batch enqueue with TTS readiness guard, "Regenerate" per-scene button, cost-estimate banner, longform-clip scene guard modal ("이미 원본 영상이 있습니다. 아바타를 올리시겠습니까?"), polling progress per scene via `avatarProviderTaskId`, RTL tests. |

## Wave Execution

```
Wave 1: [08-01]                             // foundation — schema, storage bucket, provider interface
Wave 2: [08-02, 08-03]                      // parallel: library seed/API + reference upload/consent
Wave 3: [08-04]                             // worker handler + filter graph overlay
Wave 4: [08-05]                             // UI consumes library, upload, handler, overlay
```

Within a wave, plans may run in parallel on separate agents. Wave boundaries are hard — a later wave may only start after every plan in the earlier wave has passed its acceptance criteria.

## Cross-Cutting Rules (apply to every plan in this phase)

These rules encode the Phase 7 Retry 2 learnings. Violations block merge.

1. **CAS status updates use `.returning().length`, never `.rowCount`.** postgres-js never populates `rowCount` on UPDATE, so `rowCount === 0` always reports "nothing changed" even on successful writes. Every compare-and-swap status transition in a handler MUST select back with `.returning({ id: table.id })` and check `.length > 0`. See `src/worker/handlers/longform-clip.ts` for the canonical pattern.
2. **All Supabase Storage operations use `getServiceRoleClient()` from `src/lib/supabase.ts`.** Better Auth sessions are not Supabase Auth JWTs, so `auth.uid()` in RLS is always NULL from the anon client. RLS is defense in depth, not the primary auth check — the Drizzle ownership check is.
3. **All new Storage buckets start with `public=false`.** The `avatar-references` bucket MUST be created with `public: false` in `supabase/migrations/avatar_references_bucket.sql`. Images are served via signed URLs only.
4. **All new API routes validate `session.user.id` ownership BEFORE any DB mutation.** Defense-in-depth against IDOR. Mirror the `longform-*` IDOR guard in `src/app/api/jobs/route.ts` (lines 57-88): fetch the target row, check `.userId === session.user.id`, 403 on mismatch.
5. **Streaming file I/O only — no `readFile` / `arrayBuffer` on large files.** Downloaded avatar videos from HeyGen/D-ID can exceed 100 MB; `uploadLongformSourceFromPath`-style signed-URL PUT with `createReadStream` + `duplex: 'half'` is required. See `src/lib/media/longform-storage.ts` lines 78+ for the canonical pattern.
6. **`createSignedUploadUrl` always passes `{ upsert: true }`.** Retry safety — otherwise a retried BullMQ job fails to overwrite a partial upload from the prior attempt.
7. **Idempotency checks BEFORE external side effects.** Specifically: the `generate-avatar-lipsync` handler MUST check for an existing `scenes.avatarVideoUrl` / `avatarProviderTaskId` at the TOP of the try block, BEFORE submitting to HeyGen. External cost is spent only once per logical task, even across BullMQ retries.
8. **Any FFmpeg filter graph change requires a REAL ffmpeg integration test.** Mocks are insufficient for filter_complex — the filter grammar is runtime-validated by ffmpeg itself. Plan 08-04 ships a test that runs `ffmpeg -filter_complex "<built-graph>"` against a synthetic color-source input and asserts exit code 0.
9. **All new job types must be added in two places:** `ALLOWED_JOB_TYPES` in `src/app/api/jobs/route.ts` AND the switch in `src/worker/processor.ts`.
10. **BullMQ retry safety:** every handler must be idempotent. The handler body runs inside a try/catch that updates `jobs.status='failed'` + inserts a `failed` row into `job_events`, mirroring `src/worker/handlers/export-video.ts`.
11. **No plaintext provider keys in BullMQ payloads.** Resolve HeyGen/D-ID keys via the `getUserAvatarProvider(userId)` factory inside the handler, not the payload. Keys live in `api_keys` with `provider='heygen'` or `'did'`.
12. **No fluent-ffmpeg ever.** Use `child_process.spawn` only (CLAUDE.md rule). This applies to MP3→WAV conversion (Task 3 in Plan 08-04) as well as the final export path.
13. **Drizzle migrations are generated via** `bunx drizzle-kit generate` after editing `src/lib/db/schema.ts`. Do not hand-write SQL migrations except for RLS policies.
14. **Tests live under** `src/__tests__/` and follow the `{module-name}.test.ts` convention. Every new handler gets a corresponding `*.test.ts`.

## Phase Exit Criteria (mirrors CONTEXT.md section "Phase Exit Criteria")

- [ ] User can browse the curated avatar library (>= 12 presets, filterable by gender/age/style)
- [ ] User can upload a reference photo with the Korean consent modal flow
- [ ] User can select an avatar per-scene or project-wide
- [ ] Clicking "Generate for All Scenes" enqueues N `generate-avatar-lipsync` jobs (one per scene with TTS ready)
- [ ] HeyGen is primary; D-ID fallback triggers automatically on HeyGen failure
- [ ] Generated avatar videos are composited as PIP overlay via `ffmpeg-filter-graph.ts`
- [ ] `export-video` produces a final shorts file with the avatar visible in the designated layout
- [ ] Regeneration replaces the old `avatarVideoUrl` cleanly and deletes the orphaned Supabase object
- [ ] Cost estimate is shown before any batch enqueue
- [ ] Longform-derived scene gets the "이미 원본 영상이 있습니다" guard modal
- [ ] All new handlers have unit tests; the filter graph change has a real-ffmpeg integration test
- [ ] `bun run test`, `bun run lint`, and `bunx tsc --noEmit` all exit clean
