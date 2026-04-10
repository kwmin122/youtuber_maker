# Phase 3: Script Generation - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

수집된 자막을 AI가 분석하여 주제를 추천하고, 벤치마킹 채널의 결에 맞는 대본을 A/B 변형으로 생성한다. 전체 작업 흐름이 4단계 탭 UI로 안내된다.

**Requirements:** CORE-04, CORE-05, CORE-06, UX-01

</domain>

<decisions>
## Implementation Decisions

### AI 분석 및 대본 생성
- **D-01:** AI 분석/생성에 사용자의 BYOK API 키를 사용한다 (Gemini 또는 OpenAI). Phase 1에서 구축한 api_keys 테이블에서 복호화하여 서버 측에서만 사용.
- **D-02:** 벤치마킹 분석 프롬프트 구조: 수집된 자막 full_text 여러 개 → AI가 말투/기승전결/후킹 요소 추출 → JSON 구조화 응답.
- **D-03:** 주제 추천: AI가 분석 결과 기반으로 유사 주제 5~10개를 제목+설명 형태로 추천.
- **D-04:** 대본 생성 프롬프트: 선택된 주제 + 벤치마킹 분석 결과(말투, 구조, 후킹) → 쇼츠 대본 (60초 기준, 150-200단어).
- **D-05:** A/B 변형: 동일 주제로 대본 2~3개를 동시 생성. 각 변형은 다른 후킹/구조 전략 사용.
- **D-06:** AI 호출은 BullMQ worker에서 실행 (장시간 소요 가능). 진행 상태 실시간 표시.

### 데이터 모델
- **D-07:** 2개 테이블 추가: `analyses` (벤치마킹 분석 결과), `scripts` (생성된 대본).
- **D-08:** analyses: projectId, channelId, transcriptIds[], toneAnalysis(JSON), hookingPatterns(JSON), structurePatterns(JSON), topicRecommendations(JSON).
- **D-09:** scripts: projectId, analysisId, title, content(대본 전문), variant('A'|'B'|'C'), hookType, structureType, wordCount, estimatedDuration.

### 4단계 탭 UI
- **D-10:** UX-01 구현: 1.대본 → 2.장면/이미지 → 3.음성 → 4.최종 영상. Phase 3에서는 탭 1만 구현, 탭 2-4는 placeholder.
- **D-11:** 프로젝트 상세 페이지를 탭 UI로 리팩터링. workflowState.currentStep으로 진행 상태 관리.
- **D-12:** 대본 탭 내 흐름: 채널 선택 → 자막 수집 → AI 분석 → 주제 선택 → 대본 생성 → A/B 비교.

### AI Provider 추상화
- **D-13:** AI provider 추상화 레이어 생성. Gemini와 OpenAI를 동일 인터페이스로 사용.
- **D-14:** provider 선택은 사용자의 등록된 API 키 기반. Gemini 키가 있으면 Gemini, OpenAI 키가 있으면 OpenAI 사용.
- **D-15:** 프롬프트 템플릿은 provider-agnostic. 응답 파싱만 provider별 구현.

### Claude's Discretion
- AI 프롬프트 세부 내용 (벤치마킹 분석/주제 추천/대본 생성)
- 대본 에디터 UI 세부 레이아웃
- A/B 변형 비교 UI 디자인
- 분석 결과 시각화 방식

</decisions>

<canonical_refs>
## Canonical References

### Existing Code
- `src/lib/db/schema.ts` — 현재 스키마 (channels, videos, transcripts 포함)
- `src/lib/crypto.ts` — API 키 복호화 (decrypt 함수)
- `src/app/api/jobs/route.ts` — job 제출 패턴 (ALLOWED_JOB_TYPES에 추가)
- `src/worker/processor.ts` — job dispatcher
- `src/hooks/use-job-status.ts` — 실시간 진행 상태
- `src/components/job-progress.tsx` — 진행률 UI

### External References
- Gemini API: https://ai.google.dev/gemini-api
- OpenAI API: https://platform.openai.com/docs

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- BullMQ worker + Realtime 인프라 — AI 분석/대본 생성 job에 재사용
- api_keys 테이블의 encrypt/decrypt — BYOK 키 서버 측 복호화
- channels/videos/transcripts 데이터 — AI 분석 입력

### Integration Points
- transcripts.fullText → 벤치마킹 분석 프롬프트 입력
- analyses.topicRecommendations → 대본 생성 프롬프트 입력
- scripts 테이블 → Phase 4 장면 분할 입력

</code_context>

<deferred>
## Deferred Ideas

- 대본 직접 편집 기능 (Phase 3에서는 AI 생성만, 수동 편집은 후속)
- 대본 히스토리/버전 관리

</deferred>

---

*Phase: 03-script-generation*
*Context gathered: 2026-04-08*
