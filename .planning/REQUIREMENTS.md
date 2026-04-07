# Requirements

## v1 Requirements

### CORE -- 벤치마킹 기반 대본 생성 (핵심 가치)

- [ ] **CORE-01**: 사용자가 키워드로 유튜브 채널/영상을 검색하고 조회수순, 성과도순으로 정렬할 수 있다
- [ ] **CORE-02**: 사용자가 벤치마킹할 채널을 선택하면 해당 채널의 영상 목록(썸네일, 제목, 조회수, 구독자, 성과도 배율, CII, 좋아요, 댓글, 참여율)을 테이블로 볼 수 있다
- [ ] **CORE-03**: 사용자가 벤치마킹 채널의 인기 영상 자막을 수집(조회수 높은 순 5~10개)하고 데이터로 저장할 수 있다 (youtube-transcript-api 기반, 자막 미존재 시 Google STT 폴백)
- [ ] **CORE-04**: 수집된 자막 데이터를 AI가 분석하여 말투, 기승전결, 후킹 요소를 추출하고 유사 주제 5~10개를 추천할 수 있다
- [ ] **CORE-05**: 추천 주제를 선택하면 벤치마킹 채널의 결(tone & manner)에 맞는 대본을 자동 생성한다 (후킹, 말투, 기승전결 반영)
- [ ] **CORE-06**: 대본 변형(variant)을 2~3개 동시에 생성하여 나란히 비교할 수 있다

### MEDIA -- 장면/이미지/영상 생성

- [ ] **MEDIA-01**: 대본을 장면 단위로 자동 분할하고, 각 장면에 나레이션 텍스트 + 이미지 프롬프트 + 동영상 프롬프트를 자동 생성한다
- [ ] **MEDIA-02**: 장면별 AI 이미지를 생성할 수 있다 (스타일, 모델, 캐릭터 선택 가능)
- [ ] **MEDIA-03**: 장면별 AI 영상 클립을 생성할 수 있다 (Kling 3.0 API 연동)
- [ ] **MEDIA-04**: 생성된 이미지/영상이 마음에 들지 않으면 개별 재생성하거나 직접 교체할 수 있다

### TTS -- 음성 합성 및 보이스 클로닝

- [ ] **TTS-01**: 대본 텍스트를 TTS로 음성 합성할 수 있다 (한국어 지원 필수)
- [ ] **TTS-02**: 3~20초 샘플 음성으로 보이스 클로닝하여 개인화된 목소리로 TTS를 생성할 수 있다 (Qwen3-TTS, 음성 소유 동의 + 삭제 기능 포함)
- [ ] **TTS-03**: 남/여 목소리, 말투 스타일, 음성 속도(0.5x~2.0x)를 설정할 수 있다
- [ ] **TTS-04**: TTS 생성 후 무음 구간을 자동 감지하여 삭제할 수 있다

### EDIT -- 영상 편집 및 조합

- [ ] **EDIT-01**: 자막을 편집할 수 있다 (폰트, 크기, 색상, 배경, 테두리, 그림자, 위치)
- [ ] **EDIT-02**: 장면 간 트랜지션 효과를 적용할 수 있다
- [ ] **EDIT-03**: 효과음과 배경음악을 삽입할 수 있다 (라이브러리 또는 AI 생성)
- [ ] **EDIT-04**: 비디오 캔버스에서 최종 영상을 미리보기할 수 있다 (9:16 세로 포맷)
- [ ] **EDIT-05**: 완성된 쇼츠를 MP4로 내보내기(export)할 수 있다

### DIST -- 배포 및 업로드

- [ ] **DIST-01**: YouTube API로 완성된 쇼츠를 자동 업로드할 수 있다 (제목, 설명, 태그 포함)
- [ ] **DIST-02**: 업로드 예약 시간을 지정하여 자동 게시할 수 있다
- [ ] **DIST-03**: AI가 제목/설명/해시태그를 SEO 최적화하여 자동 생성한다

### DATA -- 분석 및 대시보드

- [ ] **DATA-01**: 업로드한 쇼츠의 조회수, 좋아요, 댓글, 구독자 변화를 대시보드로 트래킹할 수 있다
- [ ] **DATA-02**: 트렌드 키워드/해시태그를 실시간 분석하여 인기 주제를 추천받을 수 있다
- [ ] **DATA-03**: 업로드 전 대본/썸네일/제목의 바이럴 스코어를 AI가 예측 채점한다

### UX -- 사용자 경험

- [ ] **UX-01**: 4단계 탭 UI로 작업 흐름을 안내한다 (1.대본 → 2.장면/이미지 → 3.음성 → 4.최종 영상)
- [ ] **UX-02**: 프로젝트를 저장/불러오기하여 작업을 이어갈 수 있다
- [ ] **UX-03**: AI 썸네일을 자동 생성하고 A/B 비교할 수 있다

### INFRA -- 인프라 및 인증

- [ ] **INFRA-01**: 이메일/소셜 로그인으로 회원가입/인증할 수 있다
- [ ] **INFRA-02**: 사용자가 본인의 AI API 키(Gemini, OpenAI 등)를 안전하게 등록/관리할 수 있다
- [ ] **INFRA-03**: API 키는 서버 측에서 암호화하여 저장하고, 클라이언트에 노출되지 않는다
- [ ] **INFRA-04**: 장시간 작업(AI 생성, 영상 렌더링, 업로드)은 백그라운드 워커에서 처리하고 진행 상태를 실시간 표시한다

### MULTI -- 멀티플랫폼

- [ ] **MULTI-01**: 완성된 쇼츠를 TikTok/Instagram Reels에도 동시 업로드할 수 있다

---

## v2 Requirements

- [ ] **CORE-07**: 롱폼 영상 → 숏츠 자동 클리핑 (바이럴 구간 AI 감지) -- 별도 영상 분석 파이프라인 필요
- [ ] **MEDIA-05**: AI 아바타/립싱크 -- 얼굴 노출 없이 "출연자 있는" 숏츠 제작 -- 기술 성숙도 부족
- [ ] **DATA-04**: 경쟁채널 갭 분석 -- 니치 내 미개척 키워드 자동 탐지 -- 데이터 축적 필요
- [ ] **EDIT-06**: AI 배경음악 자동 작곡 (Suno/Udio API) -- v1은 라이브러리로 충분
- [ ] **MULTI-02**: 플랫폼별 비율/캡션 자동 변환 (9:16, 1:1 등) -- v1은 9:16 전용

---

## Out of Scope

- 자체 AI 모델 학습/파인튜닝 -- 외부 API 활용으로 충분, 1인 개발 리소스 한계
- 모바일 네이티브 앱 -- 웹 반응형으로 대응, 네이티브 앱은 사용자 기반 확보 후
- 실시간 스트리밍 기능 -- 쇼츠 자동화와 별개 도메인
- Sora API 연동 -- 2026.09 종료 예정, Kling으로 대체
- 자체 결제/구독 시스템 (v1) -- MVP 단계에서는 BYOK 모델로 무료 제공, 유료화는 사용자 확보 후

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| CORE-01 | Phase 2 | Pending |
| CORE-02 | Phase 2 | Pending |
| CORE-03 | Phase 2 | Pending |
| CORE-04 | Phase 3 | Pending |
| CORE-05 | Phase 3 | Pending |
| CORE-06 | Phase 3 | Pending |
| MEDIA-01 | Phase 4 | Pending |
| MEDIA-02 | Phase 4 | Pending |
| MEDIA-03 | Phase 4 | Pending |
| MEDIA-04 | Phase 4 | Pending |
| TTS-01 | Phase 4 | Pending |
| TTS-02 | Phase 4 | Pending |
| TTS-03 | Phase 4 | Pending |
| TTS-04 | Phase 4 | Pending |
| EDIT-01 | Phase 5 | Pending |
| EDIT-02 | Phase 5 | Pending |
| EDIT-03 | Phase 5 | Pending |
| EDIT-04 | Phase 5 | Pending |
| EDIT-05 | Phase 5 | Pending |
| DIST-01 | Phase 6 | Pending |
| DIST-02 | Phase 6 | Pending |
| DIST-03 | Phase 6 | Pending |
| DATA-01 | Phase 6 | Pending |
| DATA-02 | Phase 6 | Pending |
| DATA-03 | Phase 6 | Pending |
| UX-01 | Phase 3 | Pending |
| UX-02 | Phase 1 | Pending |
| UX-03 | Phase 6 | Pending |
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| MULTI-01 | Phase 6 | Pending |
