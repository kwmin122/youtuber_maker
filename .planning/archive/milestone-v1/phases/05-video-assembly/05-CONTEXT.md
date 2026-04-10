# Phase 5: Video Assembly (Opencut Fork) - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Opencut(MIT) fork 기반 비디오 캔버스로 자막/트랜지션/효과음이 포함된 완성 쇼츠를 미리보고 MP4로 내보낸다.

**Requirements:** EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05

</domain>

<decisions>
## Implementation Decisions

### Opencut Fork 전략
- **D-01:** Opencut을 직접 fork하여 임베드하는 대신, Opencut의 핵심 개념(타임라인, 트랙, 클립)을 참고하여 자체 비디오 어셈블리 모듈을 구축한다. 이유: Opencut은 별도 Next.js 앱이라 임베딩이 복잡하고, 우리는 9:16 쇼츠 전용 기능만 필요.
- **D-02:** 비디오 캔버스는 HTML5 Canvas + Vidstack Player로 구현. 9:16 세로 포맷 고정.

### 자막 편집 (EDIT-01)
- **D-03:** 자막 스타일링: 폰트, 크기(px), 색상, 배경색, 테두리, 그림자, 위치(top/center/bottom).
- **D-04:** 자막 타이밍: 장면별 나레이션 텍스트와 TTS 오디오 길이 기반으로 자동 타이밍. 수동 조정 가능.
- **D-05:** 자막 데이터는 scenes 테이블의 subtitleStyle JSONB 필드에 저장.

### 트랜지션 (EDIT-02)
- **D-06:** 장면 간 트랜지션: fade, dissolve, slide-left, slide-right, zoom-in, cut (기본).
- **D-07:** 트랜지션 설정은 scenes 테이블의 transitionType, transitionDuration 필드에 저장.

### 효과음/BGM (EDIT-03)
- **D-08:** 효과음/BGM은 미리 준비된 라이브러리(royalty-free)에서 선택. 사용자 업로드도 지원.
- **D-09:** 오디오 트랙은 별도 audio_tracks 테이블에 저장. type: 'bgm' | 'sfx', startTime, endTime, volume.
- **D-10:** wavesurfer.js로 오디오 파형 시각화.

### 미리보기 (EDIT-04)
- **D-11:** Vidstack Player로 미리보기. 장면별 미디어 + 자막 + 트랜지션을 시퀀스로 재생.
- **D-12:** 미리보기는 클라이언트 측에서 렌더링 (실시간 프리뷰). 최종 Export는 서버 측 FFmpeg.

### MP4 Export (EDIT-05)
- **D-13:** 서버 측 FFmpeg로 MP4 export. 장면별 이미지/영상 + 자막 + 오디오 + 트랜지션을 합성.
- **D-14:** FFmpeg spawn (NOT fluent-ffmpeg). complex filter로 트랜지션, 자막 오버레이, 오디오 믹싱.
- **D-15:** export-video job type으로 BullMQ 워커에서 실행. 렌더링 진행률 실시간 표시.
- **D-16:** Export된 MP4는 Supabase Storage에 저장. URL을 projects 테이블에 기록.

### 데이터 모델
- **D-17:** scenes 테이블에 subtitleStyle, transitionType, transitionDuration 칼럼 추가.
- **D-18:** audio_tracks 테이블 추가: projectId, type, name, url, startTime, endTime, volume.
- **D-19:** projects 테이블에 exportedVideoUrl, exportedAt 칼럼 추가.

### Claude's Discretion
- 타임라인 UI 세부 디자인
- 자막 프리뷰 렌더링 방식
- FFmpeg filter_complex 세부 구성
- 오디오 라이브러리 초기 목록

</decisions>

<canonical_refs>
## Canonical References

### Existing Code
- `src/lib/db/schema.ts` — 현재 스키마
- `src/lib/media/storage.ts` — Supabase Storage 유틸리티
- `src/worker/processor.ts` — job dispatcher
- `src/components/workflow-tabs.tsx` — Tab 3 (Voice) 슬롯 활용

### External References
- Vidstack Player: https://www.vidstack.io
- wavesurfer.js: https://wavesurfer.xyz
- FFmpeg filter_complex: https://ffmpeg.org/ffmpeg-filters.html

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- BullMQ worker + Realtime — export job에 재사용
- Supabase Storage — export MP4 업로드
- 장면/미디어 데이터 — scenes + media_assets 테이블

### Integration Points
- scenes + media_assets → 타임라인 구성
- TTS 오디오 → 오디오 트랙
- export MP4 → Phase 6 YouTube 업로드 입력

</code_context>

<deferred>
## Deferred Ideas

- 브라우저 측 FFmpeg.wasm 경량 프리뷰
- AI 자동 트랜지션 선택
- 자막 애니메이션 효과

</deferred>

---

*Phase: 05-video-assembly*
*Context gathered: 2026-04-08*
