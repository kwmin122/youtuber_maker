# YouTuber Min — AI YouTube Shorts Factory

## What This Is

유튜브 쇼츠 자동화 SaaS 플랫폼. 성공한 채널의 대본 구조/말투/후킹 요소를 벤치마킹 분석하고, 그 '결(tone & manner)'에 맞는 대본을 AI로 생성한 뒤, 장면 이미지/영상 생성 → TTS 음성(3초 샘플 보이스 클로닝) → 자막/편집 → 유튜브 자동 업로드까지 원스톱으로 처리하는 크리에이터 대상 서비스. 단순한 '딸깍' 자동화가 아닌, 벤치마킹 기반 전략적 대본이 핵심 차별점.

## Core Value

성공한 채널의 말투/기승전결/후킹 요소를 학습하여 조회수가 나오는 대본을 생성하고, 대본 → 완성 쇼츠까지 하나의 파이프라인으로 자동화한다.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 채널 검색 및 벤치마킹 분석 (튜브렌즈 기능)
- [ ] YouTube API 기반 채널/영상 데이터 수집 (조회수, 구독자, 성과도, CII)
- [ ] 자막 수집 및 엑셀/데이터 저장
- [ ] 벤치마킹 대본 분석 → 주제 추천 (5~10개)
- [ ] 벤치마킹 결(tone) 기반 AI 대본 생성 (후킹, 말투, 기승전결 반영)
- [ ] 대본 A/B 테스트 — 대본 변형 여러 개 생성 후 비교
- [ ] 장면 분석 → 나레이션 + 이미지 프롬프트 + 동영상 프롬프트 자동 생성
- [ ] AI 이미지 생성 (장면별, 스타일/모델/캐릭터 선택)
- [ ] AI 영상 생성 (Kling/Sora/Veo 2 API 연동)
- [ ] TTS 음성 합성 (Qwen3-TTS 기반 3초 보이스 클로닝, 한국어 지원)
- [ ] 목소리 스타일 설정 (남/여, 말투, 속도 조절)
- [ ] 무음 구간 자동 삭제
- [ ] 자막 편집 (폰트, 크기, 배경, 테두리, 그림자, 위치)
- [ ] 트랜지션/이미지 효과 설정
- [ ] 비디오 캔버스 — 최종 영상 편집 및 미리보기
- [ ] 효과음/배경음악 삽입 (AI 생성 또는 라이브러리)
- [ ] YouTube API 자동 업로드 (제목, 설명, 태그 포함)
- [ ] 예약 업로드 — 지정 시간에 자동 게시
- [ ] AI SEO 최적화 — 제목/설명/해시태그 자동 생성, 최적 업로드 시간 추천
- [ ] 성과 대시보드 — 업로드한 쇼츠의 조회수/좋아요/구독자 트래킹
- [ ] 트렌드 키워드 분석 — 인기 쇼츠 키워드/해시태그 실시간 트렌드
- [ ] AI 썸네일 자동 생성 + A/B 테스트
- [ ] 바이럴 스코어 예측 — 업로드 전 대본/썸네일/제목 AI 채점
- [ ] 멀티플랫폼 배포 — TikTok/Instagram Reels 동시 업로드
- [ ] 사용자 본인 API 키 입력 방식 (Gemini, OpenAI 등)

### Out of Scope

- 롱폼 → 숏츠 자동 클리핑 — v2에서 검토 (별도 영상 분석 파이프라인 필요)
- AI 아바타/립싱크 — v2에서 검토 (기술 성숙도 부족)
- 자체 AI 모델 학습 — 외부 API 활용으로 충분
- 모바일 앱 — 웹 우선, 모바일은 반응형으로 대응

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 웹 앱 SaaS 형태 | 크리에이터 대상 서비스, 설치 불필요, 브라우저 접근 | Confirmed |
| 사용자 본인 API 키 방식 | 메이크렌즈처럼 비용 부담 최소화, Gemini 300달러 무료 크레딧 활용 가능 | Confirmed |
| Qwen3-TTS 보이스 클로닝 | 3초 샘플로 음성 복제, Apache 2.0, 한국어 지원, ElevenLabs 대비 99% 비용 절감 | Confirmed |
| 벤치마킹 기반 대본 생성이 핵심 | 단순 AI 대본이 아닌, 성공 채널의 결을 학습한 전략적 대본 | Confirmed |
| 4단계 파이프라인 UI | 메이크렌즈 참고: 1.대본 → 2.장면/이미지 → 3.음성 → 4.최종 영상 | Confirmed |

## Context

**Target users:** 유튜브 쇼츠 크리에이터 — 조회수를 올리고 싶지만 영상 제작에 시간이 많이 드는 1인 크리에이터
**Current alternative:** 튜브렌즈(채널 분석) + 메이크렌즈(영상 제작) 조합 사용, 월 29,900원+
**v1 deadline:** 사업화 목표 — 빠른 MVP 런칭 후 유료 사용자 확보
**Constraints:** 1인 풀스택 개발, 외부 AI API 의존 (Gemini, OpenAI, Kling 등)
**Success metric:** 벤치마킹 기반 대본으로 만든 쇼츠의 조회수 타율 (기존 대비 높은 성과도)

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/sunco:phase`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/sunco:milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-07 after initialization*
