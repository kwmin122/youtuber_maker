# YouTuber Min — AI YouTube Shorts Factory

유튜브 쇼츠 자동화 SaaS. 벤치마킹 기반 대본 생성 → 장면/이미지/영상 AI 생성 → TTS 보이스 클로닝 → 영상 편집 → YouTube 자동 업로드.

## Core Value

성공한 채널의 말투/기승전결/후킹 요소를 학습하여 조회수가 나오는 대본을 생성하고, 원스톱 자동화한다.

## Tech Stack

- **Framework:** Next.js 16 (App Router, React 19, TypeScript 5)
- **Styling:** Tailwind CSS v4, shadcn/ui v4
- **Database:** Supabase (PostgreSQL + Auth + Storage + Realtime)
- **ORM:** Drizzle ORM
- **Queue:** BullMQ + Redis (백그라운드 워커)
- **Video Editor:** Opencut fork (MIT, 47.8K stars) — 비디오 캔버스
- **Video Processing:** FFmpeg (spawn 직접 사용, fluent-ffmpeg 사용 금지) + FFmpeg.wasm (브라우저)
- **Audio:** wavesurfer.js (파형 UI), Silero VAD (무음 감지)
- **Player:** Vidstack Player (영상 미리보기)
- **AI APIs:** Gemini, OpenAI (사용자 BYOK), Kling 3.0 (영상), Qwen3-TTS (음성)
- **Subtitles:** youtube-transcript-api (InnerTube timedtext)
- **Hosting:** Vercel (웹) + Railway (워커)
- **Monitoring:** queuedash (BullMQ 대시보드)

## Key Decisions

- Two-tier architecture: Vercel(웹) + Railway(워커) — 서버리스 타임아웃 회피
- 사용자 본인 API 키(BYOK) — 서비스 비용 최소화
- Qwen3-TTS 보이스 클로닝 — 3초 샘플, Apache 2.0, 한국어 지원
- Sora 사용 금지 — 2026.09 종료 예정, Kling 3.0 사용
- fluent-ffmpeg 사용 금지 — 유지보수 중단, FFmpeg 7.x 호환 불가
- 자막 수집: youtube-transcript-api (YouTube Data API captions.download는 소유자 권한 필요)
- 프로젝트 뼈대: nextjs-better-auth fork (Next.js 16 + Supabase + Drizzle 100% 일치)
- 파이프라인 레퍼런스: MoneyPrinterTurbo (MIT, 55K stars)

## SUNCO Workflow

This project is managed with SUNCO. Before starting any substantial work:

1. Check current state: `/sunco:status`
2. Start work through a SUNCO command so planning artifacts stay in sync:
   - `/sunco:quick` — small fixes, doc updates, ad-hoc tasks
   - `/sunco:debug` — investigation and bug fixing
   - `/sunco:execute` — planned phase work

Do not make direct repo edits outside a SUNCO workflow unless explicitly bypassing it.

Current phase: 1 — Foundation
Next step: `/sunco:discuss 1`

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
