# Phase 6: Distribution & Analytics - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

완성된 쇼츠를 YouTube/TikTok/Reels에 자동 업로드하고, SEO 최적화와 성과 트래킹을 제공한다.

**Requirements:** DIST-01, DIST-02, DIST-03, DATA-01, DATA-02, DATA-03, UX-03, MULTI-01

</domain>

<decisions>
## Implementation Decisions

### YouTube 업로드 (DIST-01, DIST-02)
- **D-01:** YouTube Data API v3 videos.insert로 업로드. OAuth 2.0 사용자 인증 필요 (Phase 1에서 Google OAuth 설정 완료).
- **D-02:** 업로드는 BullMQ worker에서 실행 ('upload-youtube' job type). 대용량 파일 resumable upload 사용.
- **D-03:** 예약 게시: publishAt 파라미터로 YouTube API 예약 업로드. privacyStatus='private' + publishAt으로 설정.
- **D-04:** YouTube OAuth scope: youtube.upload — Phase 1에서 인증 심사 신청 완료.

### SEO 최적화 (DIST-03)
- **D-05:** AI가 대본 + 채널 분석 결과 기반으로 제목/설명/해시태그 자동 생성.
- **D-06:** 기존 AI provider 추상화 (Gemini/OpenAI) 활용. 'generate-seo' job type.

### 성과 대시보드 (DATA-01)
- **D-07:** YouTube Analytics API로 업로드 영상의 조회수/좋아요/댓글/구독자 변화 수집.
- **D-08:** 데이터는 uploads 테이블 + upload_metrics 테이블에 저장. 일일 cron job으로 갱신.
- **D-09:** 대시보드 UI: 차트(선 그래프), 영상별 성과 테이블, 전체 채널 요약.

### 바이럴 스코어 (DATA-03)
- **D-10:** AI가 대본/제목/썸네일을 분석하여 0-100 바이럴 스코어 예측.
- **D-11:** 채점 기준: 후킹 강도, 감정 유발, 트렌드 적합도, 제목 클릭 유도력.

### AI 썸네일 (UX-03)
- **D-12:** DALL-E 3로 썸네일 생성 (1280x720). 대본 내용 기반 프롬프트.
- **D-13:** A/B 비교: 2~3개 썸네일 변형 생성, 나란히 비교.

### 멀티플랫폼 (MULTI-01)
- **D-14:** TikTok/Instagram Reels 업로드는 v1에서 UI 구조만 준비. 실제 API 연동은 v2.
- **D-15:** 업로드 대상 선택 UI: YouTube (활성), TikTok/Reels (비활성, 'Coming Soon' 표시).

### 데이터 모델
- **D-16:** uploads 테이블: projectId, platform, videoUrl, youtubeVideoId, title, description, tags, thumbnailUrl, privacyStatus, publishAt, uploadedAt, status.
- **D-17:** upload_metrics 테이블: uploadId, date, viewCount, likeCount, commentCount, subscriberDelta.
- **D-18:** thumbnails 테이블: projectId, url, variant, isSelected, prompt.

### Claude's Discretion
- SEO 프롬프트 세부 구성
- 바이럴 스코어 채점 로직
- 대시보드 차트 라이브러리 선택
- 트렌드 키워드 분석 데이터 소스

</decisions>

<canonical_refs>
## Canonical References

### Existing Code
- `src/lib/ai/` — AI provider 추상화
- `src/lib/youtube/client.ts` — YouTube API 클라이언트 (search, channels, videos)
- `src/lib/media/storage.ts` — Supabase Storage
- `src/lib/media/image-generator.ts` — DALL-E 3 (썸네일 생성에 재사용)

### External References
- YouTube Data API videos.insert: https://developers.google.com/youtube/v3/docs/videos/insert
- YouTube Analytics API: https://developers.google.com/youtube/analytics

</canonical_refs>

<deferred>
## Deferred Ideas

- TikTok/Reels API 실제 연동 — v2
- 트렌드 키워드 실시간 분석 — 데이터 축적 후
- A/B 테스트 자동화 (다른 제목으로 동시 업로드 후 성과 비교)

</deferred>

---

*Phase: 06-distribution-analytics*
*Context gathered: 2026-04-08*
