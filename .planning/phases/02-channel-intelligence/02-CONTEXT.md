# Phase 2: Channel Intelligence - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

사용자가 키워드로 유튜브 채널을 검색하고, 벤치마킹할 채널의 영상 데이터와 자막을 수집할 수 있다.

**Requirements:** CORE-01, CORE-02, CORE-03

</domain>

<decisions>
## Implementation Decisions

### YouTube Data API
- **D-01:** 프로젝트 자체 YouTube API 키를 사용한다 (BYOK 아님). YouTube Data API v3 읽기 작업은 무료 쿼터(10,000 units/day)로 충분하며, 사용자별 키를 요구하면 UX가 복잡해진다.
- **D-02:** `search.list`는 100 units/call로 비싸므로, "채널 URL 직접 입력"을 primary UX로, 키워드 검색을 secondary로 제공한다. URL 입력은 `channels.list`로 1 unit만 소비.
- **D-03:** YouTube API 응답은 DB에 캐시한다. `fetched_at` 타임스탬프로 24시간 이상 지난 데이터만 재조회.

### 성과 지표 계산
- **D-04:** 성과도(Performance Score) = `video.viewCount / channel.subscriberCount`. 1.0 이상이면 채널 평균 초과.
- **D-05:** CII(Channel Influence Index) = `(avg views * engagement rate) / subscriber count`. 최근 30일 영상 가중.
- **D-06:** 참여율(Engagement Rate) = `(likeCount + commentCount) / viewCount * 100`.

### 자막 수집
- **D-07:** `youtube-transcript` npm 패키지로 InnerTube timedtext 엔드포인트 사용. YouTube API 쿼터 소비 없음.
- **D-08:** 한국어(`ko`) 우선 → 기타 언어 → 자동생성 자막 순으로 폴백.
- **D-09:** Google STT 폴백은 Phase 2에서 구현하되, 오디오 다운로드가 필요하므로 BullMQ worker에서 실행.
- **D-10:** segments는 JSONB 배열로 저장 (정규화 불필요). full_text는 Phase 3 AI 분석용 비정규화 필드.

### DB 스키마
- **D-11:** 3개 테이블 추가: channels, videos, transcripts.
- **D-12:** channels/videos는 user-scoped이지만 project-independent. project_channels junction table로 프로젝트와 연결.
- **D-13:** 영상 데이터 50개씩 batch fetch (`videos.list`는 최대 50 IDs/call, 1 unit).

### 패키지
- **D-14:** `googleapis` — YouTube Data API v3 클라이언트.
- **D-15:** `youtube-transcript` — 자막 수집 (zero deps, 13KB).
- **D-16:** Google STT는 사용자의 BYOK Google Cloud API 키 사용 (api_keys 테이블에서 복호화).

### Claude's Discretion
- API 응답 캐시 전략 세부 구현
- 채널/영상 목록 UI 레이아웃 및 테이블 컬럼 순서
- 페이지네이션 방식 (cursor vs offset)
- 자막 수집 진행률 표시 방식 (기존 JobProgress 재사용)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Conventions
- `CLAUDE.md` — Tech stack, key decisions, skill routing

### Project Artifacts
- `.planning/PROJECT.md` — Core value, key decisions, open source toolkit
- `.planning/REQUIREMENTS.md` — CORE-01~03 상세 요구사항
- `.planning/ROADMAP.md` — Phase 2 success criteria 4개 항목

### Existing Code
- `src/lib/db/schema.ts` — 현재 Drizzle 스키마 (api_keys, projects, jobs, job_events)
- `src/lib/env.ts` — 환경변수 스키마 (YOUTUBE_API_KEY 추가 필요)
- `src/lib/queue.ts` — BullMQ 큐 싱글턴 (자막 수집 job에 재사용)
- `src/worker/processor.ts` — job dispatcher (transcript-collect 핸들러 추가)
- `src/hooks/use-job-status.ts` — 실시간 진행 상태 훅 (자막 수집 진행률 표시에 재사용)

### External References
- YouTube Data API v3: https://developers.google.com/youtube/v3
- youtube-transcript npm: https://www.npmjs.com/package/youtube-transcript
- googleapis npm: https://www.npmjs.com/package/googleapis

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- BullMQ 큐 + worker 인프라 (Phase 1) — 자막 수집 batch job에 그대로 재사용
- JobProgress 컴포넌트 — 자막 수집 진행률 표시에 재사용
- Supabase Realtime 구독 — 자막 수집 상태 실시간 업데이트

### Established Patterns
- API 라우트: auth guard → zod validation → DB operation → response
- BullMQ job: POST /api/jobs → 큐 → worker handler → DB update → Realtime
- Drizzle schema: uuid PK, timestamps, cascade FK

### Integration Points
- channels/videos 데이터 → Phase 3에서 AI 분석 입력으로 사용
- transcripts.full_text → Phase 3 대본 생성 프롬프트에 직접 삽입
- project_channels junction → 프로젝트별 벤치마킹 채널 관리

</code_context>

<specifics>
## Specific Ideas

- 채널 URL 입력 시 youtube.com/@handle, /channel/UCxxx, /c/customname 등 다양한 형식 파싱
- 성과도순 정렬 시 구독자 0인 채널 처리 (division by zero 방지)
- 자막 수집은 조회수 높은 순 5~10개 영상으로 제한 (CORE-03 명세)
- 기존 ALLOWED_JOB_TYPES에 'transcript-collect' 추가

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-channel-intelligence*
*Context gathered: 2026-04-08*
