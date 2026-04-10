---
phase: 4
plan: 02
title: TTS/voice cloning, silence removal, media management UI
status: complete
duration: ~73min
completed: 2026-04-08T13:48:00Z
tasks_completed: 11
tasks_total: 11
key-files:
  created:
    - src/lib/media/tts.ts
    - src/lib/media/silence-removal.ts
    - src/worker/handlers/generate-tts.ts
    - src/app/api/voice-profiles/route.ts
    - src/app/api/voice-profiles/[id]/route.ts
    - src/app/api/projects/[id]/scenes/[sceneId]/route.ts
    - src/app/api/projects/[id]/scenes/[sceneId]/regenerate/route.ts
    - src/components/project/scene-tab.tsx
    - src/components/project/scene-card.tsx
    - src/components/project/media-preview.tsx
    - src/components/project/voice-profile-manager.tsx
    - src/__tests__/tts.test.ts
    - src/__tests__/silence-removal.test.ts
    - src/__tests__/voice-profile-api.test.ts
    - src/components/ui/alert-dialog.tsx
  modified:
    - src/worker/processor.ts
    - src/components/project/workflow-tabs.tsx
    - src/app/(dashboard)/projects/[id]/page.tsx
decisions:
  - Used btoa + Uint8Array for browser-side base64 encoding (avoid Buffer in client)
  - Enabled Tab 2 in workflow-tabs (step > 2 disabled, up from step > 1)
  - Removed fluent-ffmpeg mention from silence-removal.ts comment to pass source assertion test
tags: [tts, voice-cloning, silence-removal, ffmpeg, scene-ui, media-preview]
---

# Phase 4 Plan 02: TTS/Voice Cloning, Silence Removal, Media Management UI Summary

OpenAI TTS integration with voice/speed selection, FFmpeg-based silence removal via child_process spawn, voice profile management with consent tracking, scene update/regeneration API, and Tab 2 Scene UI with card layout and inline editing.

## Completed Tasks

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Implement OpenAI TTS module | 12321b5 | src/lib/media/tts.ts |
| 2 | Implement FFmpeg silence removal | 0a7cd7a | src/lib/media/silence-removal.ts |
| 3 | Implement generate-tts job handler | aa2d19c | src/worker/handlers/generate-tts.ts, processor.ts |
| 4 | Create voice profile API with consent | ce33035 | src/app/api/voice-profiles/route.ts, [id]/route.ts |
| 5 | Create scene update and regeneration API | ae121f1 | scenes/[sceneId]/route.ts, regenerate/route.ts |
| 6 | Build Scene Tab UI (Tab 2) | 75002d4 | scene-tab.tsx, scene-card.tsx, media-preview.tsx |
| 7 | Build voice profile manager UI | 34eb854 | voice-profile-manager.tsx |
| 8 | Wire SceneTab into workflow tabs | d100fa0 | workflow-tabs.tsx, projects/[id]/page.tsx |
| 9 | TTS module unit tests | d5b8d40 | src/__tests__/tts.test.ts |
| 10 | Silence removal unit tests | b2f0cb4 | src/__tests__/silence-removal.test.ts |
| 11 | Voice profile API tests | 4cd279f | src/__tests__/voice-profile-api.test.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed implicit any types in UI components**
- Found during: Final TypeScript check
- Issue: Event handler parameters in scene-card.tsx and voice-profile-manager.tsx had implicit `any` types
- Fix: Added explicit React.ChangeEvent<HTMLTextAreaElement> and boolean | "indeterminate" type annotations
- Files modified: scene-card.tsx, voice-profile-manager.tsx
- Commit: 7d05370

**2. [Rule 3 - Blocking] Missing shadcn alert-dialog component**
- Found during: TypeScript check after Task 7
- Issue: alert-dialog.tsx not installed but used by VoiceProfileManager
- Fix: Installed via `npx shadcn@latest add alert-dialog`
- Files modified: src/components/ui/alert-dialog.tsx (created)
- Commit: 7d05370

**3. [Rule 1 - Bug] Silence removal test false positive**
- Found during: Task 10 test run
- Issue: Comment "NOT fluent-ffmpeg" in silence-removal.ts caused `not.toContain("fluent-ffmpeg")` test to fail
- Fix: Reworded comment to avoid the string
- Files modified: src/lib/media/silence-removal.ts
- Commit: b2f0cb4

**4. [Rule 2 - Missing] Browser base64 encoding**
- Found during: Task 7 implementation
- Issue: Plan used `Buffer.from().toString("base64")` which is not available in browser
- Fix: Used `btoa` + `Uint8Array.reduce` pattern for client-side base64
- Files modified: voice-profile-manager.tsx
- Commit: 34eb854

## Verification Results

- All 140 tests pass (19 test files)
- TypeScript: No errors in plan-created files (pre-existing errors in queuedash and signin remain)

## Known Stubs

None - all components are wired to real API endpoints and data flows.

## Self-Check: PASSED

- All 14 created files verified on disk
- All 12 commit hashes verified in git log
