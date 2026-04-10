# Roadmap: YouTuber Min v2 -- AI YouTube Shorts Factory (Phase 2)

## Overview

v1에서 MVP 전체 파이프라인(벤치마킹 → 대본 → 미디어 → 편집 → 배포)을 완성했다. v2는 v1에서 이월된 2개 요구사항(DATA-02 실시간 트렌드, MULTI-01 멀티플랫폼 업로드)과 5개 신규 요구사항을 모두 구현한다. MVP 원칙을 따르지 않고 전체 기능을 일괄 구현한다.

## Phases

**Phase Numbering:**
- Integer phases (7, 8, 9...): v2 milestone work (continues from v1 phase 6)
- Decimal phases (7.1, 7.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 7: Long-form to Shorts Clipping** — 롱폼 영상 업로드 → AI 바이럴 구간 감지 → 자동 쇼츠 클리핑 파이프라인 (CORE-07)
- [ ] **Phase 8: AI Avatar & Lipsync** — 얼굴 노출 없이 AI 아바타 생성, 대본 기반 립싱크 영상 생성 (MEDIA-05)
- [ ] **Phase 9: Trend Intelligence** — 실시간 트렌드 키워드/해시태그 수집, 인기 주제 자동 추천, 경쟁채널 갭 분석 (DATA-02, DATA-04)
- [ ] **Phase 10: AI Music Composition** — Suno/Udio API 연동으로 AI 배경음악 자동 작곡 (EDIT-06)
- [ ] **Phase 11: Multi-Platform Distribution** — TikTok/Instagram Reels 실제 업로드 연동 + 플랫폼별 비율/캡션 자동 변환 (MULTI-01, MULTI-02)

## Phase Details

### Phase 7: Long-form to Shorts Clipping
**Goal**: 사용자가 긴 영상(롱폼 YouTube 영상)을 제공하면 AI가 바이럴 가능성 높은 구간을 감지하여 자동으로 쇼츠 길이(30~60초)로 클립을 잘라낸다
**Depends on**: v1 Phase 6
**Requirements**: CORE-07
**Success Criteria** (what must be TRUE):
  1. 사용자가 YouTube URL 또는 영상 파일을 입력하면 시스템이 자막 + 오디오 분석으로 하이라이트 후보 구간 5~10개를 탐지한다
  2. 각 후보 구간에 바이럴 스코어(후킹, 감정 변화, 정보 밀도 기반)가 표시된다
  3. 사용자가 선택한 구간을 자동으로 9:16 쇼츠 포맷으로 클립하여 scenes 테이블에 주입한다
  4. 클리핑된 구간은 v1의 편집/배포 파이프라인으로 그대로 연결된다
**Plans**: TBD
**UI hint**: yes
**Codex notes**: 롱폼 다운로드는 yt-dlp 또는 youtube-dl-exec 사용. 분석은 Gemini 1.5 Pro 긴 컨텍스트 활용.

### Phase 8: AI Avatar & Lipsync
**Goal**: 사용자가 얼굴 노출 없이 AI 아바타(2D 캐릭터 또는 사실적 아바타)에 대본을 립싱크시켜 "출연자 있는" 쇼츠를 제작할 수 있다
**Depends on**: Phase 7 (또는 v1 Phase 4)
**Requirements**: MEDIA-05
**Success Criteria** (what must be TRUE):
  1. 사용자가 아바타 라이브러리(남/여, 연령대, 스타일)에서 선택하거나 참조 이미지를 업로드할 수 있다
  2. 대본과 TTS 오디오를 바탕으로 립싱크된 아바타 영상이 생성된다 (HeyGen, D-ID, SadTalker 등 활용)
  3. 아바타 영상과 배경 장면(v1 Phase 4 이미지/영상)을 합성하여 장면별 클립으로 저장한다
  4. 재생성/다른 아바타로 교체 가능
**Plans**: TBD
**UI hint**: yes
**Codex notes**: HeyGen API가 가장 품질 높음. D-ID는 저렴. SadTalker(MIT)는 셀프호스팅 옵션.

### Phase 9: Trend Intelligence
**Goal**: 실시간 트렌드 데이터를 수집하여 사용자에게 인기 주제를 추천하고, 경쟁채널이 다루지 않는 갭 키워드를 탐지한다
**Depends on**: v1 Phase 2
**Requirements**: DATA-02, DATA-04
**Success Criteria** (what must be TRUE):
  1. Google Trends API 또는 YouTube 급상승 동영상 API로 일일 트렌드 키워드/해시태그가 수집되어 DB에 저장된다
  2. 사용자 선택 카테고리(뷰티, 게임, 요리 등)별로 상위 트렌드 20개가 대시보드에 표시된다
  3. 사용자가 벤치마킹 중인 채널들의 최근 영상 키워드를 분석하여 "미개척 키워드"를 자동 탐지한다
  4. 트렌드 기반 주제 추천이 v1의 script generation 플로우에 통합된다 (추천 주제에 트렌드 배지 표시)
**Plans**: TBD
**UI hint**: yes
**Codex notes**: Google Trends는 공식 API 없음 → google-trends-api (npm) 사용. YouTube 급상승은 videoCategoryId + chart=mostPopular.

### Phase 10: AI Music Composition
**Goal**: Suno 또는 Udio API를 연동하여 장면/무드/템포에 맞춘 배경음악을 AI가 자동 작곡한다
**Depends on**: v1 Phase 5
**Requirements**: EDIT-06
**Success Criteria** (what must be TRUE):
  1. 사용자가 무드(upbeat, calm, dramatic 등), 장르(pop, lofi, cinematic), 길이를 선택하여 BGM 생성을 요청할 수 있다
  2. Suno/Udio API로 30~120초 길이의 BGM이 생성되어 Supabase Storage에 저장된다
  3. 생성된 AI BGM이 v1 Phase 5의 audio_tracks 시스템에 바로 로드된다
  4. 여러 변형 생성 후 미리듣기로 선택 가능 (A/B/C 변형)
**Plans**: TBD
**UI hint**: yes
**Codex notes**: Suno API는 공식 SDK 없음 — REST 래퍼 필요. 라이선스 확인 필수 (상업적 사용).

### Phase 11: Multi-Platform Distribution
**Goal**: TikTok, Instagram Reels에 완성된 쇼츠를 실제로 업로드하고, 플랫폼별 요구 포맷(비율, 자막 위치, 설명 길이)에 맞춰 자동 변환한다
**Depends on**: v1 Phase 6
**Requirements**: MULTI-01, MULTI-02
**Success Criteria** (what must be TRUE):
  1. TikTok Content Posting API로 자동 업로드가 동작한다 (OAuth 인증 필요)
  2. Instagram Graph API로 Reels 자동 업로드가 동작한다 (비즈니스 계정 필수)
  3. 플랫폼별로 비율(TikTok 9:16, Reels 9:16, Shorts 9:16)과 길이 제한(TikTok 3분, Reels 90초, Shorts 60초)을 자동 검증/변환한다
  4. YouTube/TikTok/Reels 3개 플랫폼 동시 업로드가 단일 업로드 버튼으로 동작한다
  5. 플랫폼별 업로드 히스토리/상태가 v1의 성과 대시보드에 통합된다
**Plans**: TBD
**UI hint**: yes
**Codex notes**: TikTok Content Posting API는 심사 필요 (2~4주). Instagram Graph API는 비즈니스 계정 + Facebook 앱 리뷰 필요.

## Progress

**Execution Order:**
Phases execute in numeric order: 7 → 8 → 9 → 10 → 11

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. Long-form to Shorts Clipping | 0/TBD | Not started | - |
| 8. AI Avatar & Lipsync | 0/TBD | Not started | - |
| 9. Trend Intelligence | 0/TBD | Not started | - |
| 10. AI Music Composition | 0/TBD | Not started | - |
| 11. Multi-Platform Distribution | 0/TBD | Not started | - |
