# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 01-foundation
**Areas discussed:** 인증 구조, API 키 암호화, 워커 실시간 통신, 프로젝트 데이터 모델
**Mode:** interactive

---

## 인증 구조 (Auth Layer)

| Option | Description | Selected |
|--------|-------------|----------|
| better-auth 단독 | fork에 이미 세팅됨. Drizzle adapter로 Supabase PostgreSQL에 세션 저장 | ✓ |
| Supabase Auth 단독 | Supabase 대시보드에서 사용자 관리 가능. fork의 better-auth 설정 제거 필요 | |
| better-auth + Supabase Auth 하이브리드 | better-auth로 웹 로그인, Supabase Auth는 RLS 정책용 | |

**User's choice:** better-auth 단독
**Notes:** 인증 source of truth가 둘로 갈라지는 것 방지. Supabase는 인프라(DB/Storage/Realtime)로만 사용.

### 소셜 로그인 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 이메일 + Google | MVP 충분, YouTube 크리에이터 타겟에 적합 | ✓ |
| 이메일 + Google + Kakao | 한국 사용자 친화, 추가 설정 필요 | |
| 이메일 + Google + GitHub | 개발자 대상이면 적합, 크리에이터 타겟에는 우선도 낮음 | |

**User's choice:** 이메일 + Google
**Notes:** YouTube 크리에이터가 Google 계정을 이미 보유

---

## API 키 암호화

### 마스터 키 관리

| Option | Description | Selected |
|--------|-------------|----------|
| 환경변수 | Vercel/Railway 환경변수에 MASTER_ENCRYPTION_KEY 저장 | ✓ |
| Supabase Vault | DB 범위 내 키 관리, vendor lock-in | |
| AWS KMS / GCP KMS | 엔터프라이즈급 보안, 비용 발생 | |

**User's choice:** 환경변수 (무료 운영 + KMS 전환 가능 설계)
**Notes:** 초기에는 AWS/GCP KMS를 고려했으나 무료 운영 우선으로 환경변수 선택. key_version과 key provider 추상화로 추후 KMS 마이그레이션 경로 확보. 보안 규칙 상세 합의 (평문 노출 금지, worker는 api_key_id만 전달, last4만 UI 표시).

---

## 워커 실시간 통신

| Option | Description | Selected |
|--------|-------------|----------|
| jobs 테이블 UPDATE 구독 | 단순하고 별도 이벤트 테이블 불필요 | |
| job_events INSERT 구독 | 상세 로그 추적 가능, 데이터량 증가 | |
| jobs UPDATE + job_events 병행 | 완전하지만 복잡도 증가 | ✓ |

**User's choice:** jobs UPDATE + job_events 병행
**Notes:** production-grade 기준 선택. jobs는 UI가 현재 상태를 읽는 source of truth, job_events는 실패 원인/재시도/단계별 로그/운영 디버깅용. retention 정책 30~90일.

---

## 프로젝트 데이터 모델

| Option | Description | Selected |
|--------|-------------|----------|
| 현재 단계 + 기본 메타 | workflow_state는 UI 진행 상태만, 도메인 데이터는 정규화 | ✓ |
| 전체 상태 스냅샷 | 모든 단계 데이터를 JSONB에 통째로 저장 | |
| 상태 없음 (전부 정규화) | 엄격하지만 초기 스키마 복잡 | |

**User's choice:** 현재 단계 + 기본 메타
**Notes:** workflow_state는 current_step, last_active_tab, completed_steps, last_edited_at, draft_flags만 저장. 대본/장면/미디어 등 도메인 데이터는 각 Phase에서 별도 정규화 테이블로 추가. MVP 속도와 확장성 양립.

---

## Claude's Discretion

- DB 스키마 구체적 칼럼명/타입
- better-auth 플러그인 세부 설정
- queuedash 대시보드 접근 제어
- Drizzle migration 전략
- 테스트 잡 구체적 동작

## Deferred Ideas

- Kakao/GitHub 추가 소셜 로그인 — 사용자 피드백 기반 검토
- AWS/GCP KMS 전환 — 유료화/스케일 단계
- job_events retention 자동 정리 — 운영 안정화 후
