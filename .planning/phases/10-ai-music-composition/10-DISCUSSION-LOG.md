# Phase 10: AI Music Composition - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 10-ai-music-composition
**Areas discussed:** API & 라이선스, 앱 내 진입점, 음악 카탈로그 구현, 변형 선택 UX
**Mode:** interactive

---

## Phase 10 방향 (핵심 피벗)

| Option | Description | Selected |
|--------|-------------|----------|
| YouTube Audio Library | 정적 큐레이션 카탈로그 | |
| Suno/Udio AI 작곡 | ROADMAP 원안, BYOK 키 필요 | |
| YouTube Audio Library | 사용자 선택 | ✓ |

**User's choice:** YouTube Audio Library (= royalty-free 기존 음악 사용, AI 작곡 제외)
**Notes:** "음악은 유튜브 무료나 인기있는거 사용"

---

## 앱 내 진입점

| Option | Description | Selected |
|--------|-------------|----------|
| 오디오 트랙 매니저 안 | 기존 컴포넌트 내 다이얼로그 | ✓ |
| 대본 생성 후 화면 새 정제 | Step 3 탭에 신규 화면 추가 | |
| 별도 /music 페이지 | 독립 라우트 | |

**User's choice:** 오디오 트랙 매니저 안 (기존 audio-track-manager.tsx에 통합)

---

## 음악 카탈로그 구현

| Option | Description | Selected |
|--------|-------------|----------|
| 확장 정적 카탈로그 | 큐레이션 JSON/DB 목록 | |
| Pixabay Music API | 외부 royalty-free API | ✓ |
| 사용자 업로드 전용 | MP3/WAV 직접 업로드 | ✓ |

**User's choice:** Pixabay Music API + 사용자 업로드 (둘 다)
**Notes:** "2,3" — 두 옵션 모두 선택

---

## 변형 선택 UX

| Option | Description | Selected |
|--------|-------------|----------|
| 인라인 리스트 + 미리듣기 | 결과에서 바로 재생 후 추가 | ✓ |
| 숏리스트 + 비교 패널 | 하트로 담고 비교 | |
| 단일 선택만 | 비교 없이 단순 선택 | |

**User's choice:** 인라인 리스트 + 미리듣기 (Recommended)

---

## Deferred Ideas

- Suno/Udio AI 작곡 — 이번 Phase에서 제외, 추후 재검토 가능
