# Roadmap: YouTuber Min -- AI YouTube Shorts Factory

## Overview

벤치마킹 기반 대본 생성부터 완성 쇼츠 자동 업로드까지, 6단계에 걸쳐 전체 파이프라인을 구축한다. Foundation에서 인증/워커 인프라를 세우고, Channel Intelligence와 Script Generation으로 핵심 차별점(벤치마킹 대본)을 확보한 뒤, Media Production과 Video Assembly로 영상 생성 파이프라인을 완성하고, Distribution & Analytics로 자동 업로드와 성과 분석을 추가한다.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Foundation** - 인증, API 키 관리, DB 스키마, BullMQ 워커 인프라, 프로젝트 저장/불러오기
- [x] **Phase 2: Channel Intelligence** - YouTube 채널 검색, 영상 데이터 수집, 자막 수집 및 저장
- [x] **Phase 3: Script Generation** - 벤치마킹 분석, AI 대본 생성, A/B 변형, 4단계 탭 UI
- [x] **Phase 4: Media Production** - 장면 분할, AI 이미지/영상 생성, TTS 보이스 클로닝, 무음 제거
- [ ] **Phase 5: Video Assembly (Opencut Fork)** - Opencut fork 기반 자막 편집, 트랜지션, 효과음/BGM, 미리보기, MP4 내보내기
- [ ] **Phase 6: Distribution & Analytics** - YouTube 업로드, SEO 최적화, 예약 게시, 성과 대시보드, 멀티플랫폼

## Phase Details

### Phase 1: Foundation
**Goal**: 사용자가 안전하게 로그인하고 API 키를 등록하며, 프로젝트를 저장/불러오기할 수 있는 기반 인프라를 구축한다
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, UX-02
**Success Criteria** (what must be TRUE):
  1. 사용자가 이메일 또는 소셜 로그인으로 회원가입/로그인할 수 있다
  2. 사용자가 AI API 키(Gemini, OpenAI 등)를 등록하면 암호화되어 저장되고, 키 값이 UI에 마스킹되어 표시된다
  3. 사용자가 프로젝트를 생성/저장하고 나중에 불러와서 작업을 이어갈 수 있다
  4. 백그라운드 작업(테스트 잡)을 큐에 넣으면 워커가 처리하고 진행 상태가 실시간으로 UI에 표시된다
  5. Google OAuth 인증 심사 신청 완료 (YouTube 업로드 스코프 — 4-8주 소요)
  6. YouTube API 쿼터 증량 신청 완료
**Plans**: TBD
**UI hint**: yes
**Codex notes**: OAuth 인증 심사 4-8주 소요이므로 Phase 1에서 선행 신청 필수

### Phase 2: Channel Intelligence
**Goal**: 사용자가 키워드로 유튜브 채널을 검색하고, 벤치마킹할 채널의 영상 데이터와 자막을 수집할 수 있다
**Depends on**: Phase 1
**Requirements**: CORE-01, CORE-02, CORE-03
**Success Criteria** (what must be TRUE):
  1. 사용자가 키워드를 입력하면 관련 유튜브 채널/영상이 조회수순, 성과도순으로 정렬되어 표시된다
  2. 사용자가 채널을 선택하면 해당 채널의 영상 목록(썸네일, 제목, 조회수, 구독자, 성과도, CII, 참여율)이 테이블로 표시된다
  3. 사용자가 인기 영상의 자막을 수집 버튼으로 일괄 수집하고, 수집된 자막 데이터를 확인할 수 있다 (youtube-transcript-api 기반)
  4. 자막이 없는 영상은 Google STT 폴백으로 텍스트 추출 가능
**Plans**: TBD
**UI hint**: yes
**Codex notes**: YouTube Data API captions.download는 소유자 권한 필요 → InnerTube timedtext 엔드포인트 사용 (경쟁사 동일 방식)

### Phase 3: Script Generation
**Goal**: 수집된 자막을 AI가 분석하여 주제를 추천하고, 벤치마킹 채널의 결에 맞는 대본을 A/B 변형으로 생성한다
**Depends on**: Phase 2
**Requirements**: CORE-04, CORE-05, CORE-06, UX-01
**Success Criteria** (what must be TRUE):
  1. 수집된 자막 데이터를 AI가 분석하여 말투/기승전결/후킹 요소를 추출하고 유사 주제 5~10개를 추천한다
  2. 추천 주제를 선택하면 벤치마킹 채널의 결(tone & manner)에 맞는 대본이 자동 생성된다
  3. 대본 A/B 변형 2~3개가 동시에 생성되어 나란히 비교할 수 있다
  4. 전체 작업 흐름이 4단계 탭 UI(대본 > 장면/이미지 > 음성 > 최종 영상)로 안내된다
**Plans**: TBD
**UI hint**: yes

### Phase 4: Media Production
**Goal**: 대본을 장면 단위로 분할하고, 각 장면에 AI 이미지/영상과 TTS 보이스 클로닝 음성을 생성한다
**Depends on**: Phase 3
**Requirements**: MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04, TTS-01, TTS-02, TTS-03, TTS-04
**Success Criteria** (what must be TRUE):
  1. 대본이 장면 단위로 자동 분할되고 각 장면에 나레이션 + 이미지 프롬프트 + 영상 프롬프트가 자동 생성된다
  2. 장면별 AI 이미지를 생성할 수 있고, 스타일/모델/캐릭터를 선택할 수 있다
  3. 장면별 AI 영상 클립을 Kling API로 생성할 수 있다
  4. 마음에 들지 않는 이미지/영상을 개별 재생성하거나 직접 교체할 수 있다
  5. 3~20초 샘플 음성으로 보이스 클로닝 TTS를 생성하고, 남/여/말투/속도를 조절할 수 있다
  6. 보이스 클로닝 시 음성 소유 동의 확인 + 샘플 삭제 기능이 동작한다
**Plans**: TBD
**UI hint**: yes
**Codex notes**: 보이스 클로닝 법적 리스크 — 동의 UX, 악용 방지, 데이터 삭제 기능 필수

### Phase 5: Video Assembly (Opencut Fork)
**Goal**: Opencut(MIT) fork 기반 비디오 캔버스로 자막/트랜지션/효과음이 포함된 완성 쇼츠를 미리보고 MP4로 내보낸다
**Depends on**: Phase 4
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05
**Tech note**: Opencut (https://github.com/OpenCut-app/OpenCut) — MIT 라이선스, Next.js+Drizzle 스택 동일, 47.8K 스타. 타임라인 편집, 멀티트랙 지원. fork하여 9:16 쇼츠 전용 캔버스로 커스터마이징.
**Success Criteria** (what must be TRUE):
  1. 자막을 편집할 수 있다 (폰트, 크기, 색상, 배경, 테두리, 그림자, 위치 설정)
  2. 장면 간 트랜지션 효과를 선택/적용할 수 있다
  3. 효과음과 배경음악을 라이브러리에서 선택하여 삽입할 수 있다
  4. 비디오 캔버스(9:16)에서 최종 영상을 미리보기할 수 있다
  5. 완성된 쇼츠를 MP4로 내보내기(export)할 수 있고, 렌더링 진행률이 표시된다
**Plans**: TBD
**UI hint**: yes

### Phase 6: Distribution & Analytics
**Goal**: 완성된 쇼츠를 YouTube/TikTok/Reels에 자동 업로드하고, SEO 최적화와 성과 트래킹을 제공한다
**Depends on**: Phase 5
**Requirements**: DIST-01, DIST-02, DIST-03, DATA-01, DATA-02, DATA-03, UX-03, MULTI-01
**Success Criteria** (what must be TRUE):
  1. 완성된 쇼츠를 YouTube API로 자동 업로드할 수 있다 (제목, 설명, 태그 포함)
  2. 업로드 예약 시간을 지정하여 자동 게시할 수 있다
  3. AI가 제목/설명/해시태그를 SEO 최적화하여 자동 생성한다
  4. 업로드한 쇼츠의 조회수/좋아요/댓글/구독자 변화를 대시보드에서 트래킹할 수 있다
  5. 업로드 전 대본/썸네일/제목의 바이럴 스코어를 AI가 예측 채점한다
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete | 2026-04-08 |
| 2. Channel Intelligence | 2/2 | Complete | 2026-04-08 |
| 3. Script Generation | 2/2 | Complete | 2026-04-08 |
| 4. Media Production | 2/2 | Complete | 2026-04-08 |
| 5. Video Assembly (Opencut Fork) | 0/TBD | Not started | - |
| 6. Distribution & Analytics | 0/TBD | Not started | - |
