# Phase 1: Foundation - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

사용자가 안전하게 로그인하고 API 키를 등록하며, 프로젝트를 저장/불러오기할 수 있는 기반 인프라를 구축한다. BullMQ 워커 인프라와 실시간 진행 상태 표시를 포함한다. Google OAuth 인증 심사 선행 신청도 이 Phase에서 수행한다.

**Requirements:** INFRA-01, INFRA-02, INFRA-03, INFRA-04, UX-02

</domain>

<decisions>
## Implementation Decisions

### 인증 구조 (Auth)
- **D-01:** better-auth를 메인 인증 레이어로 사용한다. Supabase는 PostgreSQL, Storage, Realtime 인프라로만 사용하고, Supabase Auth는 v1에서 사용하지 않는다. 이유: nextjs-better-auth fork를 채택했고 인증 source of truth가 둘로 갈라지는 것을 방지.
- **D-02:** 소셜 로그인은 이메일 + Google만 지원한다. 타겟 사용자(YouTube 크리에이터)가 Google 계정을 이미 보유하므로 MVP에 충분. Kakao/GitHub 등은 후속 Phase에서 검토.
- **D-03:** YouTube 업로드 OAuth는 사용자 로그인과 분리된 Google OAuth 연결/검수 흐름으로 관리한다. Phase 1에서 YouTube Data API upload scope 인증 심사를 선행 신청한다.

### API 키 암호화
- **D-04:** Phase 1에서는 MASTER_ENCRYPTION_KEY를 Vercel/Railway 환경변수로 관리한다. 사용자 API 키는 envelope encryption + AES-256-GCM으로 암호화한다.
- **D-05:** DB에는 key_version, encrypted_dek, ciphertext, iv, auth_tag, provider, last4만 저장한다. 평문 API 키는 DB/로그/client에 절대 저장하거나 노출하지 않는다.
- **D-06:** 추후 유료/스케일 단계에서 KMS로 마이그레이션 가능하게 key_version과 key provider 추상화를 둔다.
- **D-07:** 보안 규칙:
  - MASTER_ENCRYPTION_KEY는 최소 32바이트 랜덤값
  - NEXT_PUBLIC_ prefix 절대 금지
  - API 키 평문은 입력 처리 중 메모리에서만 사용
  - 로그, 에러 메시지, analytics, job payload에 평문 API 키 금지
  - worker job에는 api_key_id만 전달, worker가 실행 시 DB에서 암호문 읽고 서버 측 복호화
  - UI에는 provider, label, last4, created_at, last_used_at만 표시
  - 삭제는 실제 row 삭제 또는 revoked_at soft delete

### 워커 실시간 통신
- **D-08:** jobs 테이블에 현재 상태를 저장하고 UI는 Supabase Realtime으로 사용자 본인의 jobs row UPDATE를 구독한다.
- **D-09:** worker는 주요 상태 전이를 job_events 테이블에 INSERT한다. job_events는 감사/디버깅용이며 retention 정책을 둔다 (30~90일 보관).
- **D-10:** jobs 테이블 칼럼: status, progress(0~100), current_step, error_message, updated_at 등을 worker가 업데이트.

### 프로젝트 데이터 모델
- **D-11:** projects.workflow_state는 UI 진행 상태만 저장한다. 포함 범위: current_step, last_active_tab, completed_steps, last_edited_at, draft_flags.
- **D-12:** 대본, 채널 데이터, scene, media asset, voice, export, upload는 각 Phase에서 별도 정규화 테이블로 추가한다. Phase 1에서는 projects, jobs, api_keys, job_events 테이블만 생성.

### Claude's Discretion
- DB 스키마의 구체적 칼럼명/타입 선택
- better-auth 플러그인 세부 설정 (세션 만료 시간, 비밀번호 정책 등)
- queuedash 대시보드 접근 제어 방식 (admin only 등)
- Drizzle migration 전략 (push vs generate+migrate)
- 테스트 잡의 구체적 동작 (워커 인프라 검증용)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Conventions
- `CLAUDE.md` — Tech stack, key decisions, skill routing, SUNCO workflow rules

### Project Artifacts
- `.planning/PROJECT.md` — Core value, key decisions table, open source toolkit 14종
- `.planning/REQUIREMENTS.md` — INFRA-01~04, UX-02 상세 요구사항
- `.planning/ROADMAP.md` — Phase 1 success criteria 6개 항목

### External References
- nextjs-better-auth fork — 프로젝트 뼈대, better-auth + Drizzle + Supabase 설정 참고
- BullMQ docs — 워커 설정, job progress, event system
- Supabase Realtime docs — Row-level subscription, RLS 정책
- queuedash — BullMQ 대시보드 임베딩 방법

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- 프로젝트는 아직 코드가 없는 상태 (CLAUDE.md만 존재). nextjs-better-auth fork를 클론하여 시작.

### Established Patterns
- nextjs-better-auth fork의 기존 패턴을 따름: App Router, Drizzle ORM, better-auth 설정
- Two-tier architecture: Vercel(웹 서버리스) + Railway(워커 long-running)

### Integration Points
- better-auth → Drizzle adapter → Supabase PostgreSQL (세션/유저 저장)
- BullMQ → Redis (Railway) → job status update → Supabase PostgreSQL → Supabase Realtime → UI
- API 키 암/복호화 모듈 → worker에서 job 실행 시 호출

</code_context>

<specifics>
## Specific Ideas

- nextjs-better-auth fork (MIT)를 프로젝트 뼈대로 클론하여 시작
- Google OAuth 검수 신청은 Phase 1에서 반드시 완료 (4-8주 소요)
- YouTube API 쿼터 증량 신청도 Phase 1에서 선행
- queuedash를 Next.js API Route에 임베드하여 BullMQ 모니터링
- MoneyPrinterTurbo (MIT, 55K stars)의 파이프라인 아키텍처 참고

</specifics>

<deferred>
## Deferred Ideas

- Kakao/GitHub 등 추가 소셜 로그인 — Phase 1 이후 사용자 피드백 기반으로 검토
- AWS/GCP KMS 전환 — 유료화/스케일 단계에서 마이그레이션
- job_events retention 자동 정리 — 운영 안정화 후 cron job으로 추가

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-04-07*
