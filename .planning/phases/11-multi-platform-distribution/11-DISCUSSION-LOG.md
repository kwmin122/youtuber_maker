# Phase 11: Multi-Platform Distribution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 11-multi-platform-distribution
**Areas discussed:** G-01 (API strategy), G-02 (OAuth UX), G-03 (format conversion), G-04 (upload orchestration), G-05 (DB schema)
**Mode:** auto

---

## G-01: API 구현 전략

| Option | Description | Selected |
|--------|-------------|----------|
| Real implementation | 실제 TikTok/Instagram API 구현, 환경 변수 게이트로 미승인 시 비활성화 | ✓ |
| Stub/mock | 심사 완료까지 mock response 반환, 심사 후 교체 | |

**Auto-selected:** Real implementation  
**Reason:** Phase 11은 v2의 마지막 단계 — stub으로 끝내면 실제 기능이 없음. 환경 변수 게이트로 앱 심사 전에도 코드 완성 상태를 유지하되 UI는 disabled 처리.

---

## G-02: OAuth 연결 UX

| Option | Description | Selected |
|--------|-------------|----------|
| Settings "연결된 계정" 탭 | 별도 설정 페이지에 플랫폼 연결 UI | ✓ |
| 업로드 다이얼로그 인라인 | 업로드 시도 시 연결 유도 | |

**Auto-selected:** Settings 페이지 "연결된 계정" 탭  
**Reason:** 기존 Google OAuth도 Settings에서 관리. 일관성 유지. 업로드 다이얼로그는 이미 연결된 계정으로 업로드하는 역할만.

---

## G-03: 포맷 변환 파이프라인

| Option | Description | Selected |
|--------|-------------|----------|
| 업로드 worker 인라인 처리 | upload-tiktok/upload-reels worker 내에서 FFmpeg 변환 | ✓ |
| 별도 pre-upload job | 변환 전용 job → 완료 후 업로드 job enqueue | |
| Export 단계에서 처리 | 영상 내보내기 시 플랫폼별 포맷 미리 생성 | |

**Auto-selected:** 업로드 worker 인라인  
**Reason:** YouTube uploader 패턴과 일관성. 별도 job 추가 없이 worker 내에서 처리하면 상태 관리 단순. Export는 이미 Phase 5에서 9:16로 렌더링하므로 대부분은 변환 불필요.

---

## G-04: 멀티 플랫폼 업로드 오케스트레이션

| Option | Description | Selected |
|--------|-------------|----------|
| 병렬 BullMQ 잡 (플랫폼별) | 선택된 각 플랫폼에 독립적인 job 생성 | ✓ |
| 순차 실행 (하나씩) | YouTube → TikTok → Reels 순서로 실행 | |
| 단일 job (멀티플랫폼) | 하나의 job이 모든 플랫폼에 순차 업로드 | |

**Auto-selected:** 병렬 BullMQ 잡  
**Reason:** 하나의 플랫폼 실패가 다른 플랫폼에 영향 없음. 사용자가 플랫폼별 상태를 독립적으로 모니터링 가능. 기존 BullMQ 패턴과 일치.

---

## G-05: DB 스키마 확장

| Option | Description | Selected |
|--------|-------------|----------|
| 플랫폼별 ID 컬럼 추가 | tiktokVideoId, reelsVideoId 컬럼 추가 | ✓ |
| platformVideoId 단일 컬럼 | youtubeVideoId 제거 후 platformVideoId로 통합 | |
| 별도 platform_uploads 테이블 | 플랫폼별 상세 정보를 별도 테이블에 | |

**Auto-selected:** 플랫폼별 ID 컬럼 추가  
**Reason:** youtubeVideoId 제거 시 breaking change 위험. 컬럼 추가는 backward-compatible migration으로 안전. 별도 테이블은 over-engineering.

---

## Claude's Discretion

- TikTok multipart upload 정확한 form structure
- Instagram Container → Publish 폴링 간격
- FFmpeg letterbox vs crop 비율 변환 기본값
- 업로드 다이얼로그 체크박스 UI 세부 디자인
- OAuth state CSRF 방어 구현 세부

## Deferred Ideas

- TikTok/Instagram analytics API 수집 → v3
- TikTok/Reels 예약 게시 → v3
- A/B 테스트 자동화 → v3
