---
phase: 5
plan: 01
subsystem: video-assembly
tags: [ffmpeg, export, subtitles, transitions, audio, api]
dependency_graph:
  requires: [phase-4-media-pipeline]
  provides: [export-video-job, subtitle-api, transition-api, audio-tracks-api, ffmpeg-filter-graph]
  affects: [scenes-table, projects-table, worker-processor, jobs-route]
tech_stack:
  added: []
  patterns: [ffmpeg-filter-complex, ass-subtitles, xfade-transitions, spawn-based-rendering]
key_files:
  created:
    - src/lib/video/types.ts
    - src/lib/video/ffmpeg-filter-graph.ts
    - src/lib/video/ffmpeg-export.ts
    - src/lib/video/subtitle-renderer.ts
    - src/worker/handlers/export-video.ts
    - src/app/api/projects/[id]/scenes/[sceneId]/subtitle/route.ts
    - src/app/api/projects/[id]/scenes/[sceneId]/transition/route.ts
    - src/app/api/projects/[id]/audio-tracks/route.ts
    - src/app/api/projects/[id]/audio-tracks/[trackId]/route.ts
    - src/app/api/projects/[id]/export/route.ts
    - src/__tests__/ffmpeg-filter-graph.test.ts
    - src/__tests__/subtitle-renderer.test.ts
    - src/__tests__/export-video-handler.test.ts
  modified:
    - src/lib/db/schema.ts
    - src/worker/processor.ts
    - src/app/api/jobs/route.ts
decisions:
  - Used ASS subtitle format as alternative to drawtext for complex subtitle rendering
  - Scene ownership verified through scene -> script -> project -> user chain
  - Audio tracks support both library selection (JSON) and file upload (multipart)
  - Export endpoint validates script selection and media asset completion before queuing
metrics:
  tasks_completed: 11
  tasks_total: 11
  tests_added: 22
  files_created: 13
  files_modified: 3
---

# Phase 5 Plan 01: Video Assembly Backend Summary

FFmpeg filter_complex graph builder, spawn-based MP4 export pipeline, ASS subtitle renderer, and REST APIs for subtitle/transition/audio-track CRUD and export triggering.

## Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | DB schema updates | 9c56a32 | src/lib/db/schema.ts |
| 2 | Video assembly types | f6efe6a | src/lib/video/types.ts |
| 3 | FFmpeg filter graph builder | d49a1ac | src/lib/video/ffmpeg-filter-graph.ts, src/__tests__/ffmpeg-filter-graph.test.ts |
| 4 | FFmpeg export executor | de66671 | src/lib/video/ffmpeg-export.ts |
| 5 | Subtitle renderer | dc5d8bb | src/lib/video/subtitle-renderer.ts, src/__tests__/subtitle-renderer.test.ts |
| 6 | Job dispatcher update | 0c653f7 | src/worker/processor.ts, src/app/api/jobs/route.ts |
| 7 | Export video handler | 86caef5 | src/worker/handlers/export-video.ts, src/__tests__/export-video-handler.test.ts |
| 8 | Subtitle API | c9b8a9d | src/app/api/projects/[id]/scenes/[sceneId]/subtitle/route.ts |
| 9 | Transition API | c6a571e | src/app/api/projects/[id]/scenes/[sceneId]/transition/route.ts |
| 10 | Audio tracks API | 4f200fd | src/app/api/projects/[id]/audio-tracks/route.ts, .../[trackId]/route.ts |
| 11 | Export trigger API | 55c6fdd | src/app/api/projects/[id]/export/route.ts |

## What Was Built

### Schema Changes
- **scenes table**: Added `subtitleStyle` (jsonb), `transitionType` (text, default "cut"), `transitionDuration` (real, default 0.5)
- **projects table**: Added `exportedVideoUrl` (text), `exportedAt` (timestamp)
- **audio_tracks table**: New table with projectId, type (bgm/sfx), name, url, storagePath, startTime, endTime, volume

### FFmpeg Pipeline (Pure Functions)
- **ffmpeg-filter-graph.ts**: Builds filter_complex strings as pure functions -- no FFmpeg spawning, fully unit-testable. Supports scene scaling/padding, xfade transitions (fade/dissolve/slide/zoom), drawtext subtitles, and audio mixing (narration concat + BGM volume/delay).
- **ffmpeg-export.ts**: Spawns FFmpeg with child_process.spawn (per CLAUDE.md). Downloads media to temp dir, builds filter graph, renders MP4, reports progress via callbacks, cleans up temp files.
- **subtitle-renderer.ts**: Generates ASS subtitle files with V4+ styles. Converts CSS hex colors to ASS format, formats timestamps, maps positions to ASS alignment numbers.

### Worker Handler
- **export-video handler**: Loads scenes + media assets + audio tracks from DB, constructs ExportRequest, calls FFmpeg export with progress tracking, uploads result to Supabase Storage, updates project with exportedVideoUrl.

### API Endpoints
- `GET/PUT/DELETE /projects/[id]/scenes/[sceneId]/subtitle` -- Subtitle style CRUD with zod validation
- `GET/PUT /projects/[id]/scenes/[sceneId]/transition` -- Transition type/duration with auto-zero for "cut"
- `GET/POST /projects/[id]/audio-tracks` -- List + add tracks (JSON or multipart upload)
- `PUT/DELETE /projects/[id]/audio-tracks/[trackId]` -- Update timing/volume, delete with storage cleanup
- `POST/GET /projects/[id]/export` -- Trigger export job, check status/result

## Test Results

- 22 test files, 162 tests -- all passing
- No new TypeScript errors introduced (pre-existing queuedash/signin errors remain)

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None -- all data flows are fully wired. The export pipeline connects scenes/media/audio to FFmpeg rendering end-to-end.
