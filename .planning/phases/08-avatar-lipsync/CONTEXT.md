# Phase 8: AI Avatar & Lipsync — Context

**Gathered**: 2026-04-10
**Mode**: autonomous (assumptions-analyzed + auto-resolved per full-implementation mandate)
**Status**: Ready for planning
**Requirements**: MEDIA-05

## Phase Boundary

사용자가 얼굴 노출 없이 AI 아바타(curated library 또는 참조 이미지 업로드)에 대본을 립싱크시켜 "출연자 있는" 쇼츠를 제작한다. 아바타 영상은 기존 v1 Phase 4 배경 장면(Kling/DALL-E) 위에 PIP(picture-in-picture)로 합성되어 최종 쇼츠로 export된다.

## Resolved Decisions

### D-01: Primary provider — HeyGen, fallback D-ID, SadTalker dropped
- **Primary**: HeyGen `/v2/video/generate` with `avatar_id` + `audio_url`. 한국어 립싱크 품질 최고.
- **Fallback**: D-ID `/talks` (per-scene automatic fallback on HeyGen failure or quota).
- **Dropped**: SadTalker — GPU 요구, Railway 워커 CPU only, BYOK 모델과 충돌.
- **BYOK**: `api_keys.provider` 값 `'heygen'`, `'did'` 신규 허용 (free-form text column이라 migration 불필요).

### D-02: Shared provider abstraction
- Create `AvatarLipsyncProvider` interface mirroring `AIProvider`.
- Methods: `listAvatars()`, `generateLipsyncJob(avatarId, audioUrl, referenceImageUrl?)`, `pollJobStatus(taskId)`, `downloadResult(taskId)`.
- Implementations: `HeyGenProvider`, `DIDProvider`.
- Shared `pollProviderTask` util factored out to reduce duplication with Kling.

### D-03: Schema — 2 new tables + 1 column on scenes
- **`avatar_presets`** (curated library + user custom):
  - `id`, `userId` (nullable for global/curated), `provider` (`'heygen'|'did'`), `providerAvatarId` (string), `gender` (`'male'|'female'|'neutral'`), `ageGroup` (`'youth'|'adult'|'senior'`), `style` (`'realistic'|'cartoon'|'anime'|'business'`), `previewImageUrl`, `voiceIdHint` (nullable provider voice id), `source` (`'library'|'custom'`), `createdAt`
- **`avatar_assets`** (user-uploaded reference photos, mirrors `voiceProfiles`):
  - `id`, `userId` NOT NULL, `storagePath`, `publicUrl`, `imageHash`, `consentRecordedAt` NOT NULL, `status` (`'pending'|'ready'|'failed'`), `createdAt`
- **`scenes`** extension: `avatarPresetId: uuid` (nullable FK to avatar_presets), `avatarLayout: jsonb` ({position, scale, enabled}), `avatarVideoUrl: text` (populated after lipsync job completes), `avatarProviderTaskId: text` (for polling/idempotency)
- **`projects`** extension: `defaultAvatarPresetId: uuid` (nullable FK) — propagated to new scenes on creation.

### D-04: Storage bucket — `avatar-references` with RLS
- New bucket `avatar-references`, file-size-limit 20 MB, MIME `image/jpeg|image/png|image/webp`.
- RLS identical to `longform-sources`: path prefix `<userId>/<uuid>.ext`.
- Consent modal required before upload — copies `voiceProfiles` pattern.

### D-05: Avatar library seed
- Seed script `scripts/seed-avatar-library.ts` fetches HeyGen + D-ID avatar lists via BYOK provider keys (admin key from env) once per deploy.
- Inserts into `avatar_presets` with `userId IS NULL`.
- Run via GitHub Action or manual `bun run seed:avatars`.
- Initial seed: 12-24 diverse avatars (6 male, 6 female, multiple age groups + styles).

### D-06: New job type — `generate-avatar-lipsync`
- Add to `ALLOWED_JOB_TYPES` in `src/app/api/jobs/route.ts`.
- Add case branch in `src/worker/processor.ts`.
- New handler `src/worker/handlers/generate-avatar-lipsync.ts`.
- **Dependency**: blocked until `scenes.audioUrl` exists AND TTS status completed.
- API route rejects enqueue when audioAsset not ready.

### D-07: Compositing strategy — PIP overlay, default bottom-right 35%
- Scenes retain background video (Kling) OR background image (DALL-E still).
- Avatar is composited via FFmpeg `overlay` filter in `ffmpeg-filter-graph.ts`.
- Default layout: `position='bottom-right'`, `scale=0.35`, `padding=24px`.
- Configurable per-scene: center, bottom-left, top-right, fullscreen.
- Fullscreen avatar mode = avatar replaces background entirely (opt-in).
- Longform-derived scenes (from Phase 7) get a UI guard: "이미 원본 영상이 있습니다. 아바타를 올리시겠습니까?"

### D-08: FFmpeg overlay filter integration
- Extend `src/lib/video/ffmpeg-filter-graph.ts` to accept avatar overlay inputs per-scene.
- Filter: `[bg][avatar]overlay=W-w-24:H-h-24:enable='between(t,0,duration)'[vout]` (bottom-right example).
- Scale avatar first: `[1:v]scale=iw*0.35:-1[avatar]`.
- Audio stream preserved from scene (avatar has muted audio track or stripped).

### D-09: TTS ordering & duration sync
- Avatar job requires `scenes.audioUrl` populated and TTS completed.
- Worker re-runs `ffprobe` on downloaded avatar video and overwrites `scenes.duration` with exact avatar length.
- Prevents lipsync drift from stale duration estimates.

### D-10: Audio format conversion
- HeyGen prefers WAV but accepts MP3. D-ID accepts MP3 + WAV.
- Worker converts TTS MP3 → WAV 16kHz mono via FFmpeg spawn before submit (if provider requires WAV).
- Reuse `src/lib/video/extract-audio.ts` spawn pattern.

### D-11: UI integration — sub-tab under Media
- Media tab gets 4 sub-tabs: `Image | Video | Audio | Avatar`.
- Avatar sub-tab components:
  - Avatar library grid (curated presets, filter by gender/age/style)
  - "Upload Reference Photo" button → consent modal → upload → avatar_asset row
  - Per-scene avatar override (dropdown in scene card)
  - Layout picker (bottom-right / center / top-right / fullscreen)
  - "Generate for All Scenes" button (enqueues N jobs)
  - "Regenerate" per-scene button
- Progress indicator reads `scenes.avatarProviderTaskId` and polls jobs table.
- Cost estimate shown before batch generation: `$X.XX (N scenes × ~$Y/scene)`.

### D-12: Regeneration & idempotency
- Each regenerate creates a new provider task — no caching.
- Old `avatarVideoUrl` replaced atomically in DB update.
- Old Supabase Storage object deleted on replace (orphan cleanup).
- UI displays regeneration count + last generated timestamp.

### D-13: Cost display
- HeyGen: ~$1.00/min (estimated)
- D-ID: ~$0.10/min
- UI shows estimated cost per scene and total before enqueueing.
- Warn user if total > $5.00 for a single project.

### D-14: Consent & legal compliance
- Upload consent modal text:
  - "이 이미지는 본인이거나, 초상권을 보유한 인물입니다."
  - "업로드된 이미지는 AI 아바타 생성 목적으로만 사용됩니다."
  - "삭제 요청 시 즉시 영구 삭제됩니다."
- `consentRecordedAt` NOT NULL enforced at DB level.
- Image hash stored to prevent duplicate uploads.
- Delete endpoint cascades to HeyGen/D-ID if provider stores uploaded reference.

### D-15: Export pipeline integration
- `src/worker/handlers/export-video.ts` already reads scene visual assets.
- Extend filter graph builder to include avatar overlay when `scene.avatarVideoUrl` is set.
- No changes needed to scene iteration logic.
- Test: longform-clip scene + avatar overlay produces valid shorts export.

### D-16: Dependencies
- No new npm packages needed.
- `@google/generative-ai` already installed (Phase 7).
- HeyGen/D-ID REST clients are custom — no official SDKs worth adding.
- FFmpeg + yt-dlp already in Dockerfile (Phase 7).

## Assumptions Summary

**Safe** (derived from code):
- BYOK pattern via `api_keys` table + `getUserAIClient` (expand for non-AI providers)
- Supabase Storage RLS pattern (mirrors longform-sources bucket)
- BullMQ worker pattern with job dependency ordering
- FFmpeg `overlay` filter is available in standard builds
- `scenes.duration` is already `real` type, updatable post-TTS

**Medium risk**:
- HeyGen free trial limits — seed script must handle 429 gracefully
- D-ID `/talks` 1-min cap on Starter tier — may need `/animations` endpoint for longer scenes
- Audio format: HeyGen may reject MP3 → WAV conversion adds latency
- Per-scene provider fallback complexity — error handling increases

**High risk**:
- Korean 초상권 / 2026 deepfake regulation — may need explicit "AI 생성" watermark
- Avatar duration drift from TTS duration — mitigation via ffprobe re-sync
- Regeneration cost per project — $18+ easy with 6 scenes × 3 retries × HeyGen

## Integration Points

1. **TTS dependency**: avatar job blocked until `scene.audioUrl` ready
2. **Export pipeline**: extended filter_complex in `ffmpeg-filter-graph.ts`
3. **BYOK**: new provider values in `api_keys`
4. **Scene/project schema**: 2 new columns on scenes, 1 on projects, 2 new tables
5. **UI**: Media tab sub-tab extension (no new top-level tabs)
6. **Job queue**: reuse main-queue (short-ish jobs, not longform-queue)

## Out of Scope (Phase 8)

- Self-hosted SadTalker (GPU infra, Phase 12+)
- Multi-character avatars (2+ avatars in same scene)
- Real-time avatar preview (static generation only)
- Voice cloning → avatar voice (voice cloning is v1 Phase 4 scope)
- Deepfake detection / watermarking algorithm (explicit disclosure text only)
- Custom avatar training (use provider libraries)

## Phase Exit Criteria

1. User can browse avatar library (12+ curated presets)
2. User can upload reference photo with consent flow
3. User selects avatar per-scene or project-wide
4. Clicking "Generate" enqueues N `generate-avatar-lipsync` jobs
5. HeyGen primary + D-ID fallback both work
6. Avatar videos composited as PIP overlay via FFmpeg
7. Export produces final shorts with avatar visible in designated layout
8. Regeneration replaces old avatar cleanly
9. Cost estimate shown before batch
10. Tests pass, typecheck clean, lint clean
