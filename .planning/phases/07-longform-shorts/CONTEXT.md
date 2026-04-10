# Phase 7: Long-form to Shorts Clipping — Context

**Gathered**: 2026-04-10
**Mode**: autonomous (assumptions-analyzed + auto-resolved per full-implementation mandate)
**Status**: Ready for planning
**Requirements**: CORE-07

## Phase Boundary

사용자가 긴 YouTube 영상 URL 또는 영상 파일을 업로드하면 AI가 바이럴 가능성 높은 구간(5~10개)을 자동 감지하여 30~60초 쇼츠로 자동 클리핑한다. 각 후보에는 바이럴 스코어가 부여되고, 사용자가 선택한 구간은 v1 편집/배포 파이프라인으로 그대로 연결된다.

## Resolved Decisions

### D-01: Download strategy — yt-dlp binary
- **Decision**: Install `yt-dlp` binary in Railway worker Docker image, spawn via `child_process` (FFmpeg 패턴 동일).
- **Why**: 가장 안정적이고 널리 쓰이는 다운로더. `@distube/ytdl-core`는 YouTube가 자주 차단.
- **Rationale**: Railway 워커에서만 실행, Vercel serverless 영향 없음.

### D-02: File upload path — Supabase Storage resumable
- **Decision**: 브라우저에서 Supabase Storage `longform-sources` 버킷으로 resumable upload → 워커가 path로 가져옴.
- **Max size**: 2 GB
- **Allowed formats**: mp4, mov, webm, mkv

### D-03: Duration bounds — 2 min to 4 hours
- **Min**: 120초 (그보다 짧으면 쇼츠 후보가 안 나옴)
- **Max**: 14400초 (4시간). 그 이상은 분석 비용/시간 과다.

### D-04: Analysis pipeline — Transcript + Gemini Files API (full audio)
- **Decision**: 두 모드 모두 지원
  1. **Transcript mode** (YouTube URL with captions): youtube-transcript로 자막 수집 → Gemini JSON mode로 하이라이트 추출
  2. **Audio mode** (파일 업로드 또는 자막 없는 YouTube): Gemini Files API에 오디오 업로드 → multimodal 분석
- **Model**: `gemini-2.5-pro` (긴 컨텍스트, multimodal). 사용자 BYOK 키 사용.
- **Why**: MVP 배제 지침에 따라 "오디오 분석"도 구현. 자막 없는 영상도 커버.

### D-05: Viral scoring — Reuse v1 viral-scorer structure
- **Dimensions**: hookScore, emotionalScore, informationDensity (+ optional trendScore)
- **Reuse**: `src/lib/distribution/viral-scorer.ts`의 스키마를 확장. Segment-level 평가 추가.
- **Output**: 각 candidate에 4개 스코어 + reason 텍스트.

### D-06: Candidate count — 5~10, user-configurable
- **Default**: 8개
- **Range**: 5~10 (사용자가 슬라이더로 조정)
- **AI prompt**: "Extract N high-potential segments" 형태.

### D-07: Clip format — 9:16 shorts with smart crop
- **Duration**: 30~60초 (AI가 segment에 맞춰 결정)
- **Format**: 1080×1920 mp4 (h264 + aac)
- **Crop strategy**: `crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920` (center-crop)
- **Phase 8 extension**: 향후 얼굴 추적 crop 추가 가능

### D-08: Output model — Child projects per clip
- **Decision**: 1 longform source → N child projects (각 클립이 독립 project)
- **Why**: 각 클립이 v1 편집/배포 파이프라인(scenes, export, YouTube 업로드)으로 그대로 흘러감.
- **Parent/child**: `projects.parent_longform_id` 컬럼 추가.

### D-09: Schema changes — longform_sources + longform_candidates + scene nullable
- **New table** `longform_sources`:
  - `id`, `user_id`, `source_type` (url/file), `source_url`, `storage_path`, `duration_seconds`, `status`, `transcript` (jsonb), `metadata` (jsonb), `created_at`
- **New table** `longform_candidates`:
  - `id`, `source_id`, `start_ms`, `end_ms`, `hook_score`, `emotional_score`, `information_density`, `trend_score`, `reason`, `title_suggestion`, `selected`, `child_project_id` (nullable), `created_at`
- **projects** 확장: `parent_longform_id` (nullable, FK)
- **scenes** 확장: `source_type` (`manual`/`longform-clip`, default `manual`). `scriptId`는 nullable로 전환.

### D-10: Job types — 3 new jobs
- `longform-download`: URL → yt-dlp → Supabase Storage, metadata 추출
- `longform-analyze`: 자막/오디오 분석 → candidates 생성
- `longform-clip`: 선택된 candidate들을 9:16 mp4로 clip → child projects 생성
- **Allowlist**: `ALLOWED_JOB_TYPES`에 3개 추가.

### D-11: UI — Dedicated longform tab + new project flow
- **Entry**: 프로젝트 목록 페이지에 "New Longform Project" 버튼
- **Flow**: URL 입력 or 파일 업로드 → 분석 진행 realtime → candidates card grid → 체크박스 선택 → "Clip to Shorts" 버튼 → N개의 child projects 생성됨
- **Score display**: 각 카드에 4개 스코어 바 + reason 툴팁
- **Auto mode**: "Auto-clip all" 버튼으로 전체 일괄 클리핑 옵션

### D-12: Worker infra
- **Disk preflight**: 워커가 clip 시작 전 `/tmp` 여유 공간 체크 (source size × 2 필요)
- **Cleanup**: `try/finally`로 tmp 파일 삭제
- **Concurrency**: longform-* 작업은 별도 BullMQ queue `longform-queue` 사용 (v1 queue와 분리)

### D-13: Transcript strategy for non-YouTube
- **YouTube URL + captions available**: youtube-transcript 사용
- **YouTube URL + no captions**: yt-dlp로 오디오 추출 → Gemini audio mode
- **Uploaded file**: Gemini audio mode 또는 FFmpeg로 오디오 추출 후 업로드

### D-14: Testing strategy
- **Unit**: yt-dlp spawn wrapper, Gemini prompt builder, segment validator
- **Integration**: DB migration test, longform_candidates flow test
- **E2E**: 모의 YouTube URL → candidates → clip 전체 flow

### D-15: Long-form playback preview
- **Decision**: Vidstack Player로 원본 롱폼 미리듣기 가능, 후보 segment를 timeline marker로 표시.

## Assumptions Summary

**Safe** (derived from code):
- BullMQ + Railway worker pattern (v1 proven)
- FFmpeg spawn for video processing (CLAUDE.md rule)
- BYOK AES-256-GCM encrypted keys via `get-user-ai-client.ts`
- Drizzle migrations + RLS policies pattern
- Supabase Storage with RLS per user

**Medium risk**:
- Gemini 2.5 Pro context window enough for 4-hour transcript (confirm via dry run — fallback: sliding window)
- Railway worker disk capacity (/tmp) — max 2 GB sources may need upgrade to larger plan
- yt-dlp licensing / YouTube ToS — personal use scope only

**High risk**:
- YouTube anti-bot detection may rate-limit yt-dlp from Railway IPs (mitigation: cookies jar, retry with backoff)
- Gemini Files API cost for long audio uploads (mitigation: 오디오 bitrate 다운 스케일링 후 업로드)

## Integration Points

1. **Auth**: better-auth session (existing)
2. **BYOK keys**: `api_keys` table → `getUserAIClient(userId)` (existing)
3. **Scene injection**: child project → existing v1 scene/script/media_assets/export pipeline
4. **Realtime progress**: Supabase Realtime `jobs` channel (existing)
5. **Dashboard**: longform sources + child projects both visible

## Out of Scope (Phase 7)

- Face-aware crop tracking → Phase 8 (avatars에서 얼굴 감지 재사용)
- Live stream clipping → v3
- Multi-speaker diarization → v3
- Auto-captioning for clipped shorts (v1 Phase 4 파이프라인이 이미 처리)

## Required New Dependencies

```
yt-dlp (binary, Railway Dockerfile)
```

TypeScript deps — none new. Gemini Files API는 기존 `@google/generative-ai`에서 지원.

## Phase Exit Criteria

1. User can paste a YouTube URL → see candidates within reasonable time
2. User can upload mp4 file → same flow
3. 5~10 candidates show with 4-dimension viral scores
4. Selected candidates clip successfully to 9:16 mp4
5. Each clip becomes a child project that works in v1 editing/distribution flow
6. Auto-clip button generates all candidates at once
7. Transcript mode + audio mode both work
8. Tests pass, lint clean
