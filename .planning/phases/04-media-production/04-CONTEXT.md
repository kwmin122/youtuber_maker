# Phase 4: Media Production - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

대본을 장면 단위로 분할하고, 각 장면에 AI 이미지/영상과 TTS 보이스 클로닝 음성을 생성한다.

**Requirements:** MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04, TTS-01, TTS-02, TTS-03, TTS-04

</domain>

<decisions>
## Implementation Decisions

### 장면 분할
- **D-01:** AI가 대본을 장면(scene) 단위로 자동 분할. 각 장면에 나레이션 텍스트 + 이미지 프롬프트 + 영상 프롬프트 자동 생성.
- **D-02:** 장면 분할은 기존 AI provider 추상화 활용 (Gemini/OpenAI BYOK).
- **D-03:** 쇼츠 60초 기준 4~8 장면이 적정.

### AI 이미지 생성
- **D-04:** 이미지 생성은 OpenAI DALL-E 3 또는 Gemini Imagen 사용 (BYOK).
- **D-05:** 스타일 옵션: realistic, anime, cartoon, 3d-render, watercolor 등.
- **D-06:** 이미지 크기: 9:16 세로 (1024x1792 for DALL-E 3).

### AI 영상 생성
- **D-07:** Kling 3.0 API 사용 (BYOK). Image-to-video 또는 text-to-video.
- **D-08:** Kling API는 비동기 — 생성 요청 후 폴링으로 완료 확인.
- **D-09:** 영상 클립 길이: 3~5초 per scene.

### TTS 보이스 클로닝
- **D-10:** Qwen3-TTS 기반 (Apache 2.0, 한국어 지원). 3~20초 샘플로 보이스 클로닝.
- **D-11:** TTS는 Railway worker에서 실행 (Qwen3-TTS를 API 서버로 배포하거나, 외부 API 사용).
- **D-12:** Phase 4에서는 Qwen3-TTS API 통합 구조만 구축. 실제 모델 배포는 별도 인프라 작업.
- **D-13:** 대안: Edge TTS (Microsoft) 또는 OpenAI TTS를 BYOK로 사용. Phase 4에서는 OpenAI TTS를 기본으로, Qwen3-TTS를 확장 옵션으로.
- **D-14:** 음성 속도 조절: 0.5x ~ 2.0x.
- **D-15:** 보이스 클로닝 시 음성 소유 동의 확인 필수. 동의 기록 저장. 샘플 삭제 기능.

### 무음 제거
- **D-16:** Silero VAD (MIT, 8.7K stars)로 무음 구간 감지. 브라우저에서 ONNX Runtime으로 실행 또는 서버 측 처리.
- **D-17:** Phase 4에서는 서버 측 처리 (worker). FFmpeg로 무음 구간 제거.

### 데이터 모델
- **D-18:** 3개 테이블 추가: scenes (장면), media_assets (이미지/영상/음성), voice_profiles (보이스 클로닝 프로필).
- **D-19:** scenes: scriptId, sceneIndex, narration, imagePrompt, videoPrompt, duration.
- **D-20:** media_assets: sceneId, type('image'|'video'|'audio'), url(Supabase Storage), provider, status, metadata.
- **D-21:** voice_profiles: userId, name, sampleUrl, consentRecordedAt, provider.

### Job Types
- **D-22:** 4개 job type 추가: 'split-scenes', 'generate-image', 'generate-video', 'generate-tts'.

### Claude's Discretion
- 장면 분할 프롬프트 세부 구성
- 이미지/영상 프롬프트 최적화 전략
- 장면 편집 UI 세부 레이아웃
- 미디어 에셋 파일 경로 구조 (Supabase Storage)

</decisions>

<canonical_refs>
## Canonical References

### Existing Code
- `src/lib/ai/` — AI provider 추상화 (Phase 3)
- `src/lib/db/schema.ts` — 현재 스키마
- `src/worker/processor.ts` — job dispatcher
- `src/app/api/jobs/route.ts` — ALLOWED_JOB_TYPES

### External References
- Kling API: https://docs.qingque.cn/d/home/eZQB0RSmNqblQ3ZGIzaVFzM3hCdg
- OpenAI TTS: https://platform.openai.com/docs/guides/text-to-speech
- Silero VAD: https://github.com/snakers4/silero-vad

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- AI provider factory — 이미지/영상 프롬프트 생성에 재사용
- BullMQ worker + Realtime — 모든 미디어 생성 job에 재사용
- scripts 테이블 — 장면 분할 입력

### Integration Points
- scripts.content → 장면 분할 입력
- scenes → Phase 5 비디오 어셈블리 입력
- media_assets → Phase 5 타임라인 소스

</code_context>

<deferred>
## Deferred Ideas

- Qwen3-TTS 자체 모델 배포 — 별도 인프라 작업
- Silero VAD 브라우저 실행 — Phase 5에서 검토
- 영상 스타일 프리셋 저장 기능

</deferred>

---

*Phase: 04-media-production*
*Context gathered: 2026-04-08*
