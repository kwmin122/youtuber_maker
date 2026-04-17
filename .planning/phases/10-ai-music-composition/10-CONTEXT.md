# Phase 10: AI Music Composition - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

royalty-free 배경음악을 검색/선택/업로드하여 프로젝트 audio_tracks에 로드한다.

**⚠️ 방향 변경**: ROADMAP.md의 "Suno/Udio AI 작곡" 접근법에서 피벗.
- Suno/Udio API는 이 Phase에서 제거 (추후 Phase에서 재검토 가능)
- 대신: Pixabay Music API (royalty-free 검색) + 사용자 직접 업로드 (MP3/WAV)

**Requirements:** EDIT-06 (음악 소스를 AI 생성에서 royalty-free 라이브러리로 재해석)

**Success Criteria (재정의):**
1. 사용자가 오디오 트랙 매니저에서 Pixabay Music 검색창을 열어 키워드/장르로 검색 가능
2. 검색 결과 리스트에서 인라인 미리듣기 후 "트랙에 추가"로 audio_tracks에 로드
3. 직접 MP3/WAV 업로드도 동일 다이얼로그에서 지원
4. 추가된 BGM이 Phase 5 오디오 트랙 시스템(wavesurfer.js, FFmpeg 믹싱)에 그대로 연결

</domain>

<decisions>
## Implementation Decisions

### D-01: 음악 소스 피벗 (핵심 결정)
- Suno/Udio API 및 BYOK 음악 키 저장 — **제거**
- 대신: **Pixabay Music API** (무료 API 키, royalty-free) + **사용자 직접 업로드**
- 기존 `audio-library.ts` 정적 목록은 Pixabay API로 대체 또는 병행 가능
- Why: 상업적 라이선스 복잡성 없음, 구현 단순, Pixabay 콘텐츠는 상업적 사용 허용

### D-02: 앱 내 진입점
- 기존 `audio-track-manager.tsx`의 "트랙 추가" 버튼 동작 수정
- Pixabay 검색 + 업로드 탭이 있는 `MusicPickerDialog` (신규 컴포넌트) 오픈
- 별도 /music 페이지 없음 — 에디터 플로우 내 인라인

### D-03: 음악 선택 UX
- 인라인 리스트 + 미리듣기 버튼 (HTML5 Audio 또는 wavesurfer.js)
- 미리듣기 후 "트랙에 추가" → audio_tracks에 삽입
- 숏리스트/비교 패널 없음 — 단순 browse + add

### D-04: MusicPickerDialog 탭 구성
- **탭 1: 검색** — Pixabay Music API (키워드, 장르, BPM 필터, 30초 미리듣기)
- **탭 2: 업로드** — 사용자 MP3/WAV 직접 업로드 → Supabase Storage → audio_tracks

### D-05: 기존 정적 오디오 라이브러리 처리
- `src/lib/video/audio-library.ts`의 하드코딩된 목록은 그대로 유지 (하위 호환)
- MusicPickerDialog는 Pixabay + 업로드만 노출 (정적 목록 탭 추가는 Claude 재량)

### D-06: 백엔드 아키텍처
- Pixabay API는 **서버사이드에서 프록시** — 클라이언트에 API 키 노출 금지
- `GET /api/music/search?q=...&genre=...` 신규 라우트로 Pixabay 호출 후 결과 반환
- 음악 파일 URL은 Pixabay CDN 직접 URL 사용 (다운로드 없이 스트리밍)
- 사용자 업로드는 기존 `uploadMedia()` 패턴 활용

### D-07: audio_tracks 통합
- 기존 Phase 5 스키마 변경 없음 — `type: 'bgm'`, `url`, `name`, `startTime`, `endTime`, `volume`
- Pixabay 트랙: `url = Pixabay CDN URL`, `storagePath = null` (로컬 저장 없음)
- 사용자 업로드: `url = Supabase Storage public URL`, `storagePath = 저장 경로`

### Claude's Discretion
- Pixabay API 응답 캐싱 전략 (서버 메모리 vs Redis vs 없음)
- 미리듣기 구현 상세 (HTML5 Audio element vs wavesurfer.js 재사용)
- 장르/BPM 필터 UI 레이아웃 세부 디자인
- 업로드 파일 크기 제한 및 형식 검증 세부 사항

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 컨벤션
- `CLAUDE.md` — 프로젝트 스택, 패턴, 금지 사항 (fluent-ffmpeg 금지 등)

### Phase 10 통합 대상 (기존 코드)
- `src/lib/db/schema.ts` — `audioTracks` 테이블 스키마 (projectId, type, name, url, storagePath, startTime, endTime, volume)
- `src/app/api/projects/[id]/audio-tracks/route.ts` — GET/POST 오디오 트랙 API
- `src/components/video/audio-track-manager.tsx` — 기존 BGM/SFX 매니저 컴포넌트 (수정 대상)
- `src/lib/video/audio-library.ts` — 기존 정적 오디오 라이브러리 (참고용)
- `src/lib/media/storage.ts` — `uploadMedia()` 함수 (사용자 업로드에 재사용)

### 외부 참고
- Pixabay Music API: https://pixabay.com/api/docs/#api_music — 무료 API 키, royalty-free, 상업적 사용 허용

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `uploadMedia({ userId, projectId, sceneId, filename, buffer, contentType })` — 사용자 업로드 MP3 저장에 직접 재사용
- `POST /api/projects/[id]/audio-tracks` — 트랙 추가 API, 신규 소스(Pixabay, 업로드)에서도 동일하게 사용
- `audio-track-manager.tsx` — AudioLibraryDialog 트리거 포함, 수정/확장 대상
- 기존 `AUDIO_LIBRARY` 배열 — 참고용 데이터 구조 (id, title, artist, url, type, duration, genre 등)

### Established Patterns
- API 라우트: `src/app/api/` App Router 패턴 (session guard → IDOR check → DB 작업)
- 외부 API 프록시: 서버사이드에서 호출, 클라이언트에 키 노출 금지 (Phase 9 Google Trends 패턴 참고)
- BullMQ 비동기 처리: 이번 Phase에서는 불필요 (Pixabay URL은 즉시 사용, 업로드는 동기 처리)

### Integration Points
- `audio-track-manager.tsx` → `MusicPickerDialog` (신규) — 기존 "추가" 버튼에 연결
- `GET /api/music/search` (신규) → Pixabay API 프록시
- `POST /api/projects/[id]/audio-tracks` — 선택된 트랙 저장 (기존 라우트 재사용)

</code_context>

<specifics>
## Specific Ideas

- "음악은 유튜브 무료나 인기있는거 사용" — 사용자 의도: AI 작곡 대신 기존 royalty-free 음악 활용
- Pixabay Music API는 API 키가 무료이고 상업적 사용도 허용 — 라이선스 걱정 없음
- 스트리밍 URL 직접 사용 (다운로드/재인코딩 없이) — 단순하고 빠름
- 사용자 업로드는 기존 uploadMedia 패턴으로 충분

</specifics>

<deferred>
## Deferred Ideas

### Suno/Udio AI 작곡 (이 Phase에서 제외)
- ROADMAP.md 원안의 AI 작곡 기능 (무드/장르/길이 입력 → AI 생성)
- 상업적 라이선스 복잡성과 BYOK 추가 키 관리 부담으로 이번 Phase에서 제외
- 추후 v3 또는 별도 Phase에서 재검토 가능

</deferred>

---

*Phase: 10-ai-music-composition*
*Context gathered: 2026-04-16*
