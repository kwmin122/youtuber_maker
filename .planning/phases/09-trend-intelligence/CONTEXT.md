# Phase 9: Trend Intelligence — Context

**Gathered**: 2026-04-11
**Resolved**: 2026-04-11 (user confirmed all 7 decisions + added Q8)
**Mode**: autonomous (full-implementation mandate)
**Status**: Ready for planning
**Requirements**: DATA-02 (실시간 트렌드 — near-real-time 6h refresh), DATA-04 (미개척 키워드 탐지)
**Depends on**: v1 Phase 2 (Channel Intelligence)

## Phase Boundary

실시간 트렌드 데이터(YouTube 급상승 + 선택적 Google Trends)를 수집하여 `/trends` 대시보드에 카테고리별 상위 20개 키워드를 표시하고, 사용자가 벤치마킹 중인 채널들이 다루지 않는 "미개척 키워드"를 자동 탐지하여 script generation 플로우에 통합한다. 트렌드 데이터는 글로벌(공용) + 갭 분석은 per-user + BYOK Gemini 재사용 패턴으로 구현한다.

## Safe Assumptions (derived from code)

### A-01: YouTube Data API 클라이언트 재사용
- **Evidence**: `src/lib/youtube/client.ts` — `google.youtube({version: "v3", auth: env.YOUTUBE_API_KEY})` 싱글톤 이미 존재. `googleapis ^171.4.0` 설치됨 (`package.json`).
- **사용처**: 새 `videos.list(chart=mostPopular, videoCategoryId, regionCode=KR)` 호출 추가. 1 unit/call, 10–15 카테고리 × 1회 = 15 units/day (quota 무시 가능).

### A-02: 서버 소유 YouTube API 키 (BYOK 아님)
- **Evidence**: `src/lib/env.ts:14` `YOUTUBE_API_KEY: z.string().min(1)` 필수. `.planning/phases/02-channel-intelligence/02-CONTEXT.md` D-01 "프로젝트 자체 YouTube API 키 사용" 선례.
- **사용처**: 트렌드 ingestion은 서버 키로, 갭 분석 Gemini는 user BYOK로 분리.

### A-03: BYOK Gemini 갭 분석 패턴 재사용
- **Evidence**: `src/worker/handlers/analyze-benchmark.ts:149` `getUserAIClient(userId)` → `provider.generateText(prompt, {jsonMode: true, maxTokens: 8192})` 확립된 패턴.
- **사용처**: `analyze-gap` 핸들러가 동일 패턴 사용, titles+descriptions 기반 키워드 추출 + 세트 차집합 + Gemini rationale.

### A-04: RLS 패턴 — 전역 테이블은 `avatarPresets.userId` nullable 패턴 참고
- **Evidence**: `src/lib/db/schema.ts:411` `avatarPresets.userId text("user_id")` nullable — 라이브러리 프리셋은 글로벌, 사용자 커스텀은 per-user. 동일 패턴으로 `trend_snapshots` 구현.
- **제약**: `src/lib/supabase.ts:7–21` — Better Auth 세션 → `auth.uid()` NULL → RLS deny-by-default. 글로벌 trend 읽기는 API route 경유 필수 (브라우저 직접 Supabase 금지).

### A-05: 카테고리는 YouTube `videoCategoryId` 정수
- **Evidence**: `src/lib/youtube/types.ts:43` `categoryId: string // "22" = People & Blogs` — 업로드 경로에서 이미 정수 카테고리 사용.
- **사용처**: DB에 `category_id int` 저장, UI에 한국어 라벨 매핑 (뷰티/게임/요리/엔터/교육 등).

### A-06: TopicPicker 타입 확장 경로
- **Evidence**: `src/components/project/topic-picker.tsx:6–13` `TopicRecommendation` 인라인 타입 + 라인 55–66 이미 `viralBadgeColor` pill 렌더. 배지 추가 패턴 동일.
- **사용처**: `trendBadge?: {source, score, keywordId}` 필드 추가.

### A-07: Korean JSON 응답 컨벤션
- **Evidence**: `src/lib/ai/prompts.ts:12` "Always respond in Korean" 하드코딩.
- **사용처**: 새 gap-analysis 프롬프트도 한국어 응답 강제.

## Medium Risk Assumptions

### M-01: google-trends-api 유지보수 상태 (D-01 Option C 의존)
- **Risk**: 공식 Google API 아님, 스크래퍼 기반. Google bot detection에 쉽게 차단될 수 있음. Korean locale (`geo: 'KR'`) 지원 여부 불확실.
- **Mitigation**: 사용한다면 non-fatal 보조 enrichment로 처리. YouTube trending은 성공해도 Google Trends만 실패하면 전체 job은 `partial` 플래그로 성공 처리. 또는 완전히 제외.

### M-02: BullMQ JobScheduler 신규 도입
- **Risk**: 기존 코드는 스케줄러를 전혀 사용하지 않음 (`src/lib/queue.ts:1–22`). BullMQ `upsertJobScheduler` 사용 필요, Railway 재배포 시 중복 등록 리스크.
- **Mitigation**: 안정된 `jobId: 'trend-ingest-daily'` 사용, worker bootstrap에서 idempotent upsert. 또는 Vercel Cron으로 대체 (D-08 Option B).

### M-03: Korean 카테고리 taxonomy 불일치
- **Risk**: 웹툰, k-pop subgenres, 먹방은 YouTube의 14개 기본 카테고리에 정확히 매핑 안됨 ("먹방" → Entertainment 24 + Howto & Style 26 양쪽).
- **Mitigation**: 주요 10개 카테고리로 시작 + 사용자 정의 키워드 필터로 2차 좁히기 (D-04 Option C).

### M-04: Gap 분석 토큰 예산
- **Risk**: Phase 2에서 이미 transcripts 3000자 × 5–10 videos로 8192 토큰 ceiling 근접. 트렌드 비교까지 같은 call에 넣으면 overflow.
- **Mitigation**: 결정론적 set-diff 선행 → Gemini는 랭킹/이유만 (D-05 Option C).

## High Risk Assumptions — USER MUST CONFIRM

### H-01: `jobs.userId NOT NULL` 제약 충돌
- **Evidence**: `src/lib/db/schema.ts:132` `user_id text notNull().references(user.id)`. 트렌드 ingestion cron은 사용자가 없음.
- **선택지**:
  - **A**: `jobs.userId` nullable 마이그레이션 (기존 IDOR 체크에 영향)
  - **B**: 별도 `trend_ingestion_runs` 감사 테이블 (jobs 테이블 깨끗하게 유지)
  - **C**: 시스템 사용자 행 1개 생성 (`user.id = 'system'`), cron 작업은 이 user로
- **추천**: **B** — jobs 테이블 contract 안 깨짐, Phase 7/8에서 확립한 IDOR 패턴 유지.

### H-02: Gap 분석 알고리즘 정의의 모호성
- **Evidence**: DATA-04 "경쟁채널이 다루지 않는 갭 키워드" — "다루지 않는" 기준이 모호. 벤치 채널 중 0개? N개 미만? 퍼센트?
- **영향**: 알고리즘 선택이 비용 10배 차이. 순수 set-diff vs Gemini 전체 분석.
- **추천**: 세트 차집합 (현재 트렌드 − 벤치 채널 키워드 합집합) + 사용자가 결과 클릭 시 Gemini 상세 rationale (D-05 Option C).

### H-03: Trend 추천의 script generation 통합 방식
- **Evidence**: 성공 기준 #4 "script generation 플로우에 통합 (트렌드 배지)" — 배지만 표시? 자동 주입? 클릭 시 topic 선택?
- **추천**: TopicPicker에 `trendBadge?: {source, score}` 필드 추가, 배지 클릭 시 해당 트렌드 키워드가 script 프롬프트에 hint로 주입. 강제 아님 (사용자 선택권).

## Resolved Decisions (2026-04-11)

**All decisions confirmed by user. Planning proceeds with these as locked constraints.**

### R-01 (Q1): Trend data source — **C + feature flag + non-fatal**
- YouTube Trending API = primary/stable source (official, BYOK-free)
- Google Trends (via `google-trends-api` npm or server-side scraper) = **feature-flag gated** + **non-fatal enrichment only**
- `env.GOOGLE_TRENDS_ENABLED=false` by default on first deploy. Flip to `true` after verifying package stability.
- Any Google Trends failure → log + set `partial: true` on the ingestion run, continue with YouTube data only
- **Rationale**: 공식/안정 소스는 YouTube. Google Trends 실패가 제품 신뢰도를 깨면 안 됨.

### R-02 (Q2): Cron scheduling — **Vercel Cron**
- `/api/cron/trend-ingest` route with `x-cron-secret` header verification
- Vercel Cron config in `vercel.json` schedules the HTTP call every 6h (see R-08)
- The cron route validates the secret, then creates a row in `trend_ingestion_runs` and enqueues the work into BullMQ via the worker's main queue
- **Rationale**: BullMQ Scheduler는 코드베이스에 없는 운영 표면을 여는 것. Phase 9에 불필요.

### R-03 (Q3): Region support — **`region_code` column stored**
- Schema includes `region_code text NOT NULL DEFAULT 'KR'` on `trend_snapshots` and `trend_ingestion_runs`
- Unique constraint includes `region_code` so KR/JP/US can coexist in the future
- UI hardcodes `region_code='KR'` for Phase 9 — no region switcher
- **Rationale**: v3에서 지역 확장 시 migration pain 방지.

### R-04 (Q4): Cron run tracking — **separate `trend_ingestion_runs` audit table**
- `jobs.userId NOT NULL` constraint stays intact (Phase 7/8 IDOR/ownership contract preserved)
- New table `trend_ingestion_runs` (no userId, service/admin runs): `id`, `started_at`, `ended_at`, `region_code`, `category_count`, `success_count`, `partial_count`, `failure_count`, `error_details jsonb`, `source` ('vercel-cron' | 'manual')
- Admin-triggered manual refresh reuses the same table via a different `source` value
- **Rationale**: Phase 7/8에서 고생해서 만든 IDOR 계약 보호.

### R-05 (Q5): Gap detection algorithm — **tiered + top-N background precompute**
- **Tier 1 (always, cheap)**: deterministic set-diff between `trend_snapshots` keywords and benchmarked channel keywords (titles + descriptions, NOT transcripts)
- **Tier 2 (background precompute)**: after each trend refresh, enqueue a background job that precomputes Gemini rationales for the **top 10 gap keywords per user** with active benchmark channels — cached in `trend_gap_analyses.rationale_cache jsonb`
- **Tier 3 (on-demand)**: if user clicks a gap keyword not in the cache, fire a synchronous Gemini call, write back to `rationale_cache`
- **Rationale**: 완성형 제품이면 상위 N개는 background로 precompute. 사용자가 클릭 시 즉시 표시되어야 함.

### R-06 (Q6): Keyword lifecycle — **time-series snapshots + 30-day retention**
- `trend_snapshots` is append-only: (`recorded_at`, `category_id`, `region_code`, `keyword`) composite unique
- Ingest job's final step: `DELETE FROM trend_snapshots WHERE recorded_at < NOW() - INTERVAL '30 days'`
- Enables "상승률" UI (compare latest snapshot vs previous) — 제품의 차별화 가치
- **Rationale**: 트렌드는 "현재값"보다 "상승/하락"이 제품 가치.

### R-07 (Q7): Out of scope for Phase 9 — **expanded exclusions**
Explicitly deferred:
- Multi-region UI (schema ready, no UI)
- TikTok/Instagram trends (Phase 11 territory)
- Full transcript keyword extraction (titles + descriptions only)
- 자동 대본 생성 / 자동 게시 (사용자는 배지 보고 클릭해야 함)
- SMS/email/push 알림
- Google Trends as primary source (YouTube is primary, Trends is non-fatal enrichment)
- 유료 proxy/scraping 인프라 (google-trends-api 비공식 패키지로 한정, 스크래핑 infra 절대 금지)
- Historical trend analytics charts (v3)
- 사용자 정의 커스텀 카테고리 (YouTube categoryId + keyword filter만)
- Real-time (<1h) refresh (6h 주기가 near-real-time 한계)
- 자동 gap re-run on channel add (manual trigger only)

### R-08 (Q8 NEW): Refresh cadence — **near-real-time 6h + manual refresh + stale banner**
- **This resolves the DATA-02 "실시간" vs "daily cron" 모순** that would otherwise undermine product credibility
- Vercel Cron triggers `/api/cron/trend-ingest` every **6 hours** (4 runs/day)
- Admin manual refresh button on `/trends` page (session-gated, any logged-in user) fires the same ingestion via `POST /api/trends/refresh` — rate-limited to 1/min per user
- `/trends` UI shows "마지막 업데이트: {timestamp}" banner. If `now() - last_successful_run > 8h`, banner turns red ("데이터가 오래되었습니다 — 수동으로 새로고침")
- YouTube Data API budget: ~15 units/call × 10 categories × 4 runs/day × 1 region = 600 units/day (quota 10k → 6% usage, fine)
- **Rationale**: Daily로는 "실시간" 표기 불가. 6h는 YouTube trending chart 업데이트 주기와 정합.

## Open Decisions (original list — kept for audit)

### D-01: Trend data source
- **A**: YouTube Data API only (공식, BYOK-free, 키워드 phrase 부족)
- **B**: google-trends-api only (비공식, 깨질 수 있음, phrase 풍부)
- **C**: YouTube primary + Google Trends non-fatal 보조
- **Recommended**: **C** — YouTube = 안정적 topic 신호, Google Trends = 추가 키워드 phrase. Google Trends 실패 시 job은 `partial` 성공.

### D-02: Ingestion model
- **A**: Per-user cron with user BYOK (YouTube 키는 BYOK 아님 → 불가)
- **B**: 서버 키 cron, 모든 사용자에게 동일 트렌드 데이터 공유
- **C**: 하이브리드 — 글로벌 트렌드는 서버 키 cron, per-user 갭 분석은 BYOK Gemini
- **Recommended**: **C** — Phase 2/3의 "YouTube 서버 키 + LLM BYOK" 분할과 일관.

### D-03: Schema — time-series vs flat
- **A**: Flat `trend_keywords` (fetchedAt + 매일 덮어쓰기)
- **B**: `trend_snapshots` time-series (date, categoryId, region) 복합키 + 30일 TTL
- **C**: `trend_keywords` (현재) + `trend_history` (주간 롤업)
- **Recommended**: **B** — "트렌드 상승률" UX 가능, 30일 retention Postgres에서 저렴.

### D-04: Category taxonomy
- **A**: YouTube `videoCategoryId` 정수만
- **B**: 커스텀 문자열 카테고리
- **C**: YouTube categoryId + 사용자 정의 focus keyword 필터
- **Recommended**: **C** — deterministic API call + 한국 niche 대응.

### D-05: Gap detection algorithm
- **A**: 순수 set-diff (cheap, no LLM, no rationale)
- **B**: Full Gemini JSON-mode call (expensive, rationale 포함)
- **C**: 계층 — set-diff 기본 + Gemini rationale on-demand
- **Recommended**: **C** — 리스트 조회는 cheap, 클릭 시 상세 rationale.

### D-06: UI integration point
- **A**: 새 `/trends` 대시보드 페이지 + TopicPicker 배지 확장 (둘 다)
- **B**: Analytics 페이지 안에 섹션 주입
- **C**: 배지만 — 전용 페이지 없음
- **Recommended**: **A** — 성공 기준 #2(대시보드)와 #4(배지) 모두 필요.

### D-07: BYOK vs server key for YouTube
- **A**: 새 BYOK provider `'youtube-data'` 추가, 사용자가 직접 키 제공
- **B**: `env.YOUTUBE_API_KEY` 유일 (현 상태, Phase 2 D-01)
- **Recommended**: **B** — 일관성, UX 단순, quota 여유.

### D-08: Cron scheduling mechanism
- **A**: BullMQ `upsertJobScheduler` in worker bootstrap
- **B**: Vercel Cron → `/api/cron/trend-ingest` (secret header) → enqueue to BullMQ
- **C**: Railway native cron service
- **Recommended**: **B** — Vercel Cron 무료, 재배포 중복 없음, 기존 `/api/jobs` 패턴 재사용.

### D-09: Keyword extraction source
- **A**: Title only
- **B**: Title + description
- **C**: Title + description + transcript (Phase 2 재사용)
- **Recommended**: **B** — transcript 재사용 시 8192 토큰 ceiling 충돌. Titles + descriptions가 YouTube 노출 신호와 동일.

### D-10: Trend keyword lifecycle
- **A**: 매일 덮어쓰기 (history 없음)
- **B**: Append-only snapshots + 30일 TTL (ingest job 끝에 `DELETE WHERE recorded_at < now() - 30 days`)
- **C**: Append-only + manual archive
- **Recommended**: **B**.

### D-11: Integration with Phase 2 channel analyzer
- **A**: `analyze-benchmark.ts` 프롬프트 확장 (tight coupling)
- **B**: 독립 `analyze-gap` 핸들러 (느슨 결합)
- **C**: `analyze-benchmark` 완료 후 `analyze-gap` 자동 체인
- **Recommended**: **B** + 사용자 수동 트리거 + 미래 옵션 **C**.

### D-12: API limits + fallback strategy
- **A**: 하드 실패 + stale 데이터 경고
- **B**: Per-category soft fail + continue
- **C**: 전날 스냅샷 fallback
- **Recommended**: **B + C** — category별 soft fail + "마지막 성공 refresh: {timestamp}" 배너.

### D-13: Korean locale + region support
- **A**: `regionCode: 'KR'` 하드코딩, 스키마에 region 컬럼 없음
- **B**: `region_code` 컬럼 저장, default 'KR', UI 없음
- **C**: Full multi-region UI
- **Recommended**: **B** — 1 컬럼 추가로 v3 migration pain 방지.

### D-14: Out of scope for Phase 9
- Multi-region UI (스키마만 준비)
- TikTok/Instagram 트렌드 (Phase 11)
- 트렌드 기반 자동 스케줄링
- Historical trend 차트 (v3)
- SMS/email 알림
- 사용자 정의 커스텀 카테고리
- Full transcript 키워드 추출
- 자동 re-run on channel add

## Assumptions Summary

**Safe** (derived from code):
- YouTube Data API 서버 키 패턴 (Phase 2 precedent)
- BYOK Gemini 재사용 (analyze-benchmark.ts template)
- TopicPicker 확장 가능한 badge 패턴
- `avatarPresets.userId` nullable → 글로벌 데이터 precedent
- Korean JSON 응답 prompt 패턴

**Medium risk**:
- google-trends-api 의존성 안정성 (D-01 non-fatal mitigation)
- BullMQ JobScheduler 신규 도입 (D-08 Vercel Cron 대안)
- Korean niche 카테고리 매핑 (D-04 사용자 키워드 필터)
- Gap 분석 토큰 예산 (D-05 계층 알고리즘)

**High risk**:
- `jobs.userId NOT NULL` 충돌 → 별도 `trend_ingestion_runs` 테이블 권장
- Gap 정의 모호성 → 세트 차집합 + on-demand rationale
- Script 통합 방식 → 배지 + 클릭 시 prompt hint 주입

## Integration Points

1. **v1 Phase 2 Channel Intelligence**
   - `src/lib/youtube/client.ts` 확장 (새 `getTrendingVideos(categoryId, regionCode)`)
   - `src/worker/handlers/analyze-benchmark.ts` 패턴 참고
   - `src/app/api/channels/*` 재사용 (videos 테이블 키워드 추출)

2. **v1 Phase 3 Script Generation**
   - `src/components/project/topic-picker.tsx` `TopicRecommendation` 타입 확장
   - `src/lib/ai/types.ts` 공통 타입 export
   - 배지 클릭 시 script 프롬프트 hint 주입 (선택적)

3. **Worker queue**
   - `src/worker/processor.ts` 새 케이스 `ingest-trends`, `analyze-gap`
   - `src/app/api/jobs/route.ts` `ALLOWED_JOB_TYPES` 확장
   - IDOR: `analyze-gap`은 userId 필수, `ingest-trends`는 admin cron (D-08 secret header)

4. **Scheduling**
   - Vercel Cron → `/api/cron/trend-ingest` (secret header 검증) → BullMQ enqueue
   - 실패 시 jobEvents에 기록, 다음 날 재시도 (BullMQ backoff)

5. **Schema (new tables)**
   - `trend_snapshots` — 전역, userId 없음, (date, categoryId, regionCode, keyword) 고유
   - `trend_gap_analyses` — per-user, `userId NOT NULL`, 벤치 channel set hash + trend snapshot date 캐시 키
   - `trend_ingestion_runs` — 감사 테이블 (cron 실행 기록, userId 없음)

6. **Dashboard UI**
   - 새 `/trends` 페이지 (`src/app/(dashboard)/trends/page.tsx`)
   - `src/app/(dashboard)/layout.tsx` 사이드바에 "트렌드" 링크 추가

## Phase Exit Criteria

1. 일일 cron이 카테고리별 트렌드 키워드/영상을 `trend_snapshots`에 수집 (최소 10 카테고리 × 20 items, `regionCode=KR`)
2. `/trends` 대시보드 페이지에서 카테고리별 상위 20 트렌드 렌더링
3. 새 `analyze-gap` 워커 핸들러가 per-user 갭 키워드 리스트를 `trend_gap_analyses`에 저장, UI에 표시
4. `TopicPicker`에 트렌드 배지 표시 (script generation 플로우 통합)
5. 단위 테스트: ingestion 클라이언트, set-diff, API routes, gap handler → 목표 +25~35개 테스트 (436 → 460+)
6. 기존 테스트 regression 없음, typecheck 8 baseline 유지, lint clean
7. Railway worker 환경변수 업데이트, Vercel Cron 구성 문서화
8. Codex cold review 통과

## Open Questions for User — ALL RESOLVED

See "Resolved Decisions" section (R-01 through R-08). Planning proceeds with:
- R-01: YouTube primary + Google Trends feature-flag non-fatal
- R-02: Vercel Cron + secret header
- R-03: `region_code` column stored
- R-04: Separate `trend_ingestion_runs` audit table
- R-05: Tiered gap detection + top-N background precompute + on-demand fallback
- R-06: Time-series 30-day retention
- R-07: Expanded out-of-scope list
- R-08: **NEW** — 6-hour refresh cadence + manual refresh + stale banner (DATA-02 "실시간" resolved)

## Key File References

- `.planning/ROADMAP.md` (Phase 9 spec)
- `src/lib/youtube/client.ts` (확장 대상)
- `src/worker/handlers/analyze-benchmark.ts` (패턴 template)
- `src/lib/db/schema.ts:411` (avatarPresets nullable userId 선례)
- `src/lib/db/schema.ts:132` (jobs.userId NOT NULL — H-01 충돌점)
- `src/lib/queue.ts` (BullMQ 기본 설정, repeat 없음)
- `src/components/project/topic-picker.tsx` (TopicRecommendation 확장점)
- `src/lib/env.ts:14` (YOUTUBE_API_KEY 필수)
- `src/app/(dashboard)/layout.tsx` (사이드바 확장점)
