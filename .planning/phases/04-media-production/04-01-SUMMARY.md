---
phase: 4
plan: 01
title: "Media Production Pipeline Foundation"
subsystem: media-production
tags: [scenes, image-generation, video-generation, storage, kling, dalle3]
dependency_graph:
  requires: [phase-3-scripts]
  provides: [scene-splitting, image-generation, video-generation, media-storage]
  affects: [media-ui, tts-pipeline, video-assembly]
tech_stack:
  added: [kling-3.0-api, dall-e-3-image-gen, supabase-storage]
  patterns: [async-polling, stub-mode, byok-key-resolution, media-asset-lifecycle]
key_files:
  created:
    - src/lib/media/storage.ts
    - src/lib/media/image-generator.ts
    - src/lib/media/kling-client.ts
    - src/worker/handlers/split-scenes.ts
    - src/worker/handlers/generate-image.ts
    - src/worker/handlers/generate-video.ts
    - src/app/api/projects/[id]/scenes/route.ts
    - src/app/api/projects/[id]/scenes/[sceneId]/media/route.ts
    - src/__tests__/scene-split-prompt.test.ts
    - src/__tests__/image-generator.test.ts
    - src/__tests__/kling-client.test.ts
    - src/__tests__/media-storage.test.ts
  modified:
    - src/app/api/jobs/route.ts
    - src/worker/processor.ts
decisions:
  - "Kling client uses stub mode when no API key is registered (graceful degradation)"
  - "Image generation resolves OpenAI key directly (bypasses AIProvider abstraction for SDK images.generate)"
  - "Generate-video creates media_asset in 'generating' status, updates on completion"
metrics:
  duration: "6 minutes"
  completed: "2026-04-08T04:32:02Z"
  tasks_completed: 14
  tasks_total: 14
  tests_added: 20
  tests_passing: 121
---

# Phase 4 Plan 01: Media Production Pipeline Foundation Summary

DB schema (scenes, media_assets, voice_profiles), scene splitting AI, DALL-E 3 image generation, Kling 3.0 video generation stub, Supabase Storage utilities, and API endpoints for the full media production pipeline.

## What Was Built

### Data Layer (Tasks 01-02)
- 3 new DB tables: `scenes`, `media_assets`, `voice_profiles` with full FK cascade relationships
- Media type definitions: SceneData, ImageGenerationRequest/Result, VideoGenerationTask, StorageUploadResult

### AI Scene Splitting (Task 03)
- `buildSceneSplitPrompt`: splits 60s Shorts scripts into 4-8 scenes with narration + image prompt + video prompt
- `parseSceneSplitResponse`: robust JSON parser with markdown fence stripping, field validation, auto-assignment

### Media Utilities (Tasks 04-06)
- `storage.ts`: uploadMedia, uploadVoiceSample, deleteFromStorage, downloadFromUrl
- `image-generator.ts`: DALL-E 3 integration with 7 style options, 1024x1792 vertical format
- `kling-client.ts`: KlingClient class with submit/poll/waitForCompletion, stub mode for development

### Job Handlers (Tasks 07-10)
- 4 new job types registered: split-scenes, generate-image, generate-video, generate-tts
- `split-scenes`: loads script, calls AI, parses scenes, saves to DB (supports re-splitting)
- `generate-image`: resolves BYOK OpenAI key, generates via DALL-E 3, downloads/uploads to storage
- `generate-video`: resolves Kling key (stub fallback), async submit/poll, uploads result

### API Endpoints (Task 11)
- `GET /api/projects/:id/scenes`: lists scenes for selected script, ordered by sceneIndex
- `GET /api/projects/:id/scenes/:sceneId/media`: lists media assets for a scene

### Tests (Tasks 12-14)
- 10 tests for scene-split prompt builder and parser
- 9 tests for image generator export and Kling client stub mode
- 1 test for media storage module exports
- Total: 20 new tests, 121 total passing

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 01 | f29e648 | DB schema: scenes, media_assets, voice_profiles tables |
| 02 | dd4167c | Media type definitions |
| 03 | 8e4223c | Scene splitting prompt builder and parser |
| 04 | 2dfde1d | Supabase Storage upload/download utility |
| 05 | eb910c1 | OpenAI DALL-E 3 image generator |
| 06 | 704d7ad | Kling 3.0 API client with stub mode |
| 07 | 2255b0c | Register 4 new job types in API and processor |
| 08 | 1b21e56 | Split-scenes job handler |
| 09 | b4dc04b | Generate-image job handler |
| 10 | 5dd4544 | Generate-video job handler (Kling) |
| 11 | a2294c2 | Scenes and media assets API endpoints |
| 12 | e6df631 | Unit tests for scene-split prompt and parser |
| 13 | dbf59cd | Unit tests for image generator and Kling client |
| 14 | 08c535d | Unit tests for media storage module |
| fix | 0a2d54e | Fix TS error in image-generator null check |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript error in image-generator.ts**
- **Found during:** Final verification (npx tsc --noEmit)
- **Issue:** `response.data` could be undefined, causing TS error on array access
- **Fix:** Added explicit null check for `response.data` before accessing `[0]`
- **Files modified:** src/lib/media/image-generator.ts
- **Commit:** 0a2d54e

## Known Stubs

- `kling-client.ts`: Stub mode returns placeholder video URLs when no Kling API key is registered. This is intentional -- real Kling integration activates when user registers a BYOK key.

## Self-Check: PASSED
