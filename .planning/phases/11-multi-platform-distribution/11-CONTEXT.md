# Phase 11: Multi-Platform Distribution - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

TikTok Content Posting API와 Instagram Graph API를 연동하여 완성된 쇼츠를 실제 업로드한다. 플랫폼별 OAuth 연결 UX, 포맷 검증/변환 파이프라인(FFmpeg), 멀티 플랫폼 동시 업로드 오케스트레이션을 구현한다.

**Requirements:** MULTI-01, MULTI-02

**Out of scope for this phase:**
- TikTok/Instagram 댓글 수집, 인게이지먼트 분석 (v3)
- 예약 게시 (TikTok/Reels — 플랫폼 API 제약으로 YouTube만 지원)
- YouTube Shorts 포맷 변경 (Phase 6에서 완료)
- 동영상 생성 파이프라인 변경

</domain>

<decisions>
## Implementation Decisions

### G-01: API 구현 전략 — Real Implementation (환경 변수 게이트)
- **D-01:** TikTok Content Posting API와 Instagram Graph API를 실제 구현한다. stub이나 mock 없이 실제 OAuth 플로우와 업로드 API를 구현.
- **D-02:** 환경 변수 게이트: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`이 없으면 해당 플랫폼 연결 UI를 disabled 상태로 렌더링. 앱 심사 전에도 코드는 완성 상태.
- **D-03:** TikTok OAuth 2.0 (authorization code flow), Instagram Graph API OAuth (Facebook Login).

### G-02: OAuth 연결 UX — Settings 페이지 "연결된 계정" 탭
- **D-04:** `/settings`(또는 `/dashboard/settings`) 페이지에 "연결된 계정" 탭을 추가한다. Google(기존), TikTok, Instagram 연결 상태 표시 + Connect/Disconnect 버튼.
- **D-05:** OAuth callback routes: `GET /api/auth/tiktok/callback`, `GET /api/auth/instagram/callback`. access token은 DB의 기존 `account` 테이블(Better Auth 스키마)에 저장 — `providerId: "tiktok"`, `providerId: "instagram"`.
- **D-06:** TikTok access token 만료는 refresh token으로 갱신. Instagram access token은 60일 유효, long-lived token으로 교환.

### G-03: 포맷 변환 파이프라인 — 업로드 전 검증 + 변환
- **D-07:** 업로드 요청 시 플랫폼별 제한을 먼저 검증한다:
  - YouTube Shorts: 60초, 9:16
  - TikTok: 3분(180초), 9:16
  - Instagram Reels: 90초, 9:16
- **D-08:** 비율이 9:16이 아니면 FFmpeg로 변환 (letterbox 또는 crop — Claude 재량). 길이가 초과면 트림 또는 업로드 차단(사용자 선택).
- **D-09:** 포맷 변환은 업로드 worker(upload-tiktok, upload-reels) 내에서 인라인으로 처리한다. 별도 pre-upload job 없음 — YouTube uploader 패턴 참고.
- **D-10:** 기존 `src/lib/media/ffmpeg.ts` 또는 유사 FFmpeg 유틸리티를 재사용. 없으면 새 `src/lib/media/video-format.ts`에 ratio/duration 검증 + 변환 유틸 생성.

### G-04: 멀티 플랫폼 업로드 오케스트레이션 — 병렬 BullMQ 잡
- **D-11:** 업로드 다이얼로그에서 사용자가 플랫폼(YouTube/TikTok/Instagram)을 체크박스로 선택. "업로드 시작" 클릭 시 선택된 플랫폼별로 독립된 BullMQ job을 생성 (`upload-youtube`, `upload-tiktok`, `upload-reels`).
- **D-12:** 각 플랫폼 job은 독립적으로 실행 (병렬). 하나가 실패해도 다른 플랫폼 업로드는 계속.
- **D-13:** 업로드 상태는 플랫폼별로 별도 표시 (예: YouTube ✅ | TikTok ⏳ | Instagram ❌). 기존 업로드 다이얼로그/analytics page 확장.
- **D-14:** API route: `POST /api/projects/[id]/upload` 기존 route 확장 — body에 `platforms: ("youtube" | "tiktok" | "reels")[]` 필드 추가. 각 플랫폼별 job을 enqueue.

### G-05: DB 스키마 확장 — 플랫폼별 비디오 ID 컬럼 추가
- **D-15:** `uploads` 테이블에 `tiktokVideoId text`, `reelsVideoId text` (Instagram media ID) 컬럼 추가. 기존 `youtubeVideoId` 유지 — backward compatible.
- **D-16:** `platform` 컬럼은 이미 존재 (`'youtube' | 'tiktok' | 'reels'`). 스키마 변경 불필요.
- **D-17:** `upload_metrics` 테이블은 현재 YouTube 전용. TikTok/Instagram metrics는 Phase 11 범위 밖 (별도 analytics API 심사 필요). 이 테이블은 변경 없음.
- **D-18:** Drizzle migration: `db/migrations/` 에 새 migration 파일 추가.

### 기존 인프라 재사용
- **D-19:** BullMQ `getQueue()` — worker에 `upload-tiktok`, `upload-reels` job type 추가.
- **D-20:** `account` 테이블 (Better Auth) — TikTok/Instagram access token 저장에 재사용. `providerId: "tiktok"` / `"instagram"`.
- **D-21:** `src/lib/media/storage.ts` — Supabase Storage에서 exported video 다운로드 재사용.
- **D-22:** 기존 `POST /api/projects/[id]/upload` route — 확장 방식 (신규 route 생성 아님).

### Claude's Discretion
- TikTok 업로드 API의 정확한 multipart form 구조 (실제 API 문서 따름)
- Instagram Container Create → Publish 2-step 업로드 폴링 간격
- FFmpeg letterbox vs crop 비율 변환 기본값
- 업로드 다이얼로그 플랫폼 선택 UI 컴포넌트 세부 디자인
- TikTok/Instagram OAuth state parameter CSRF 방어 구현 세부

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SUNCO Conventions
- `CLAUDE.md` — 전체 tech stack, key decisions (FFmpeg 직접 spawn, fluent-ffmpeg 금지, BYOK 패턴)

### Existing Distribution Infrastructure
- `src/lib/distribution/types.ts` — UploadPlatform, UploadStatus, YouTubeUploadRequest 타입 (확장 기반)
- `src/lib/youtube/uploader.ts` — YouTube 업로드 구현 패턴 (TikTok/Instagram uploader 구현 참고)
- `src/worker/handlers/upload-youtube.ts` — BullMQ worker handler 패턴 (신규 worker handler 구현 기준)
- `src/app/api/projects/[id]/upload/route.ts` — 업로드 API route (확장 대상)
- `src/lib/db/schema.ts` — uploads, upload_metrics, account 테이블 스키마

### Prior Phase Context
- `.planning/phases/06-distribution-analytics/06-CONTEXT.md` — D-14/D-15: Phase 6에서 TikTok/Reels를 v2로 명시 이월한 맥락

### External API References (연구 필요)
- TikTok Content Posting API: Content Posting API 문서 (Research agent가 확인)
- Instagram Graph API: Reels 업로드 — POST /me/media (container create) → POST /me/media_publish
- Better Auth account table: `src/db/schema/auth/account.ts` — providerId 패턴

### No External Specs
- 공식 TikTok/Instagram API 문서는 Research agent가 최신 버전 확인 (sunco-phase-researcher)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `uploadVideoToYouTube()` in `src/lib/youtube/uploader.ts` — OAuth2Client 패턴, Buffer → Readable 변환, onProgress 콜백. TikTok/Instagram uploader의 구현 템플릿.
- `handleUploadYouTube()` in `src/worker/handlers/upload-youtube.ts` — jobs/jobEvents 업데이트 패턴, uploads row 생성 패턴. 신규 handler의 구현 기준.
- `getQueue()` in `src/lib/queue/` — BullMQ queue 접근, 신규 job type 추가만 필요.
- `downloadFromUrl()` in `src/lib/media/storage.ts` — Supabase Storage URL에서 Buffer 다운로드. 재사용.
- `account` table in `src/db/schema/auth/account.ts` — `providerId`, `accessToken`, `refreshToken` 컬럼. TikTok/Instagram 토큰 저장.

### Established Patterns
- BullMQ worker → upload job: `type: "upload-youtube"` → Phase 11에서 `"upload-tiktok"`, `"upload-reels"` 추가
- Job progress update: `db.update(jobs).set({ progress, currentStep }).where(eq(jobs.id, jobId))`
- Session guard: `getServerSession()` + 401 반환 패턴
- Platform field: `uploads.platform` 이미 `'youtube' | 'tiktok' | 'reels'` 지원

### Integration Points
- `src/app/(dashboard)/projects/[id]/page.tsx` — 업로드 버튼/다이얼로그가 있는 프로젝트 상세 페이지 (플랫폼 선택 체크박스 추가)
- `src/app/(dashboard)/analytics/page.tsx` — platform별 upload 상태 표시 (TikTok/Reels 행 추가)
- `src/worker/index.ts` — worker dispatch table (신규 job type 등록)

</code_context>

<specifics>
## Specific Ideas

- Phase 6 D-14: "TikTok/Reels 업로드는 v1에서 UI 구조만 준비. 실제 API 연동은 v2" → Phase 11이 이것을 실현
- ROADMAP.md Codex notes: "TikTok Content Posting API는 심사 필요 (2~4주). Instagram Graph API는 비즈니스 계정 + Facebook 앱 리뷰 필요" → 환경 변수 게이트로 심사 전에도 코드 완성 상태 유지

</specifics>

<deferred>
## Deferred Ideas

- TikTok/Instagram 성과 지표 수집 (analytics API — 별도 앱 심사 필요) → v3
- 예약 게시 (TikTok/Reels) → 플랫폼 API 지원 여부 확인 후 v3
- A/B 테스트 (다른 제목으로 동시 업로드 후 성과 비교) → v3

</deferred>

---

*Phase: 11-multi-platform-distribution*
*Context gathered: 2026-04-16*
*Mode: auto*
