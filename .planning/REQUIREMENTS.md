# Requirements

## v2 Requirements (ACTIVE)

### CORE -- 콘텐츠 소스 확장

- [ ] **CORE-07**: 사용자가 긴 YouTube 영상 URL 또는 파일을 업로드하면 AI가 바이럴 구간(5~10개)을 자동 감지하고 30~60초 쇼츠로 자동 클리핑할 수 있다

### MEDIA -- 출연자 있는 숏츠

- [ ] **MEDIA-05**: 얼굴 노출 없이 AI 아바타(라이브러리 선택 또는 참조 이미지 업로드)에 대본을 립싱크시켜 "출연자 있는" 쇼츠를 생성할 수 있다

### DATA -- 실시간 트렌드 & 경쟁 분석

- [ ] **DATA-02**: 트렌드 키워드/해시태그를 실시간 분석하여 인기 주제를 추천받을 수 있다 (Google Trends + YouTube 급상승) — v1 이월
- [ ] **DATA-04**: 벤치마킹 중인 경쟁 채널이 다루지 않는 "미개척 키워드"를 자동 탐지한다 (경쟁채널 갭 분석)

### EDIT -- AI 배경음악

- [ ] **EDIT-06**: Suno/Udio API로 무드/장르/길이 기반 AI 배경음악을 자동 작곡하고 audio_tracks에 바로 로드할 수 있다

### MULTI -- 멀티플랫폼 배포

- [ ] **MULTI-01**: 완성된 쇼츠를 TikTok/Instagram Reels에도 실제로 자동 업로드할 수 있다 (OAuth 인증) — v1 이월
- [ ] **MULTI-02**: 플랫폼별 비율/길이/자막 위치를 자동 검증 및 변환한다 (YouTube Shorts 60초, TikTok 3분, Reels 90초)

---

## v1 Requirements (COMPLETED 2026-04-09)

**31/31 in-scope requirements delivered.** Full list: `.planning/archive/milestone-v1/REQUIREMENTS.md`

Summary of v1 scope:
- CORE-01~06: 벤치마킹 대본 생성 파이프라인
- MEDIA-01~04: 장면/이미지/영상 생성
- TTS-01~04: 음성 합성 + 보이스 클로닝
- EDIT-01~05: 영상 편집 (자막, 트랜지션, BGM, 프리뷰, MP4 Export)
- DIST-01~03: YouTube 업로드 + SEO
- DATA-01, DATA-03: 성과 대시보드 + 바이럴 스코어
- UX-01~03: 4단계 탭 UI, 프로젝트 저장, AI 썸네일
- INFRA-01~04: 인증, 암호화, BullMQ 워커

---

## Out of Scope

- 자체 AI 모델 학습/파인튜닝 -- 외부 API 활용으로 충분, 1인 개발 리소스 한계
- 모바일 네이티브 앱 -- 웹 반응형으로 대응, 네이티브 앱은 사용자 기반 확보 후
- 실시간 스트리밍 기능 -- 쇼츠 자동화와 별개 도메인
- Sora API 연동 -- 2026.09 종료 예정, Kling으로 대체
- 자체 결제/구독 시스템 (v2) -- BYOK 모델 유지, 유료화는 v3 검토

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| CORE-07 | Phase 7 | Pending |
| MEDIA-05 | Phase 8 | Pending |
| DATA-02 | Phase 9 | Pending |
| DATA-04 | Phase 9 | Pending |
| EDIT-06 | Phase 10 | Pending |
| MULTI-01 | Phase 11 | Pending |
| MULTI-02 | Phase 11 | Pending |
