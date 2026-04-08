---
phase: 5
plan: 02
title: "Timeline UI, subtitle editor, transition picker, audio track manager, video preview, export button, Tab 3+4 wiring"
status: complete
completed_date: "2026-04-08"
tasks_completed: 13
tasks_total: 13
key_files:
  created:
    - src/lib/video/audio-library.ts
    - src/hooks/use-scene-settings.ts
    - src/hooks/use-audio-tracks.ts
    - src/hooks/use-export-job.ts
    - src/components/video/timeline.tsx
    - src/components/video/timeline-track.tsx
    - src/components/video/scene-clip.tsx
    - src/components/video/subtitle-editor.tsx
    - src/components/video/subtitle-preview.tsx
    - src/components/video/transition-picker.tsx
    - src/components/video/audio-track-manager.tsx
    - src/components/video/audio-waveform.tsx
    - src/components/video/audio-library-dialog.tsx
    - src/components/video/video-preview.tsx
    - src/components/video/export-button.tsx
    - src/components/video/export-progress.tsx
    - src/components/project/voice-tab.tsx
    - src/components/project/video-tab.tsx
    - src/__tests__/timeline.test.tsx
    - src/__tests__/subtitle-editor.test.tsx
    - src/__tests__/export-button.test.tsx
    - vitest.setup.ts
  modified:
    - package.json
    - vitest.config.ts
    - src/components/project/workflow-tabs.tsx
    - src/app/(dashboard)/projects/[id]/page.tsx
decisions:
  - "Used vidstack web components (not @vidstack/react) for React 19 compatibility"
  - "Added per-file // @vitest-environment jsdom directive instead of environmentMatchGlobs"
  - "Added shadcn slider, select, toggle-group, dialog, progress, toggle components"
---

# Phase 5 Plan 02: Video Assembly UI Summary

Complete video editing UI: timeline, subtitle editor, transition picker, audio manager with wavesurfer.js, 9:16 video preview with Vidstack, export button, and all 4 workflow tabs active.

## Task Completion

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 5-02-01 | Install vidstack and wavesurfer.js | f6c1d02 | Done |
| 5-02-02 | Create royalty-free audio library data | 1effd18 | Done |
| 5-02-03 | Create custom hooks (scene settings, audio tracks, export job) | d11b8d6 | Done |
| 5-02-04 | Build timeline UI components | 6f01290 | Done |
| 5-02-05 | Build subtitle editor with live preview | 46346ef | Done |
| 5-02-06 | Build transition picker component | beb26f7 | Done |
| 5-02-07 | Build audio track manager with wavesurfer.js waveform | 89f3b56 | Done |
| 5-02-08 | Build video preview with Vidstack Player | 10c2776 | Done |
| 5-02-09 | Build export button and progress components | 1e2efed | Done |
| 5-02-10 | Build Voice tab (Tab 3) | ea46646 | Done |
| 5-02-11 | Build Video tab (Tab 4) | d78ffe1 | Done |
| 5-02-12 | Wire Tab 3 and Tab 4 into workflow-tabs | e6e94e0 | Done |
| 5-02-13 | Create timeline component test | d694f7b | Done |

## What Was Built

### Timeline UI
- Horizontal scrollable timeline with time ruler (1s ticks, 5s labels)
- SceneClip components showing thumbnail, index, narration, and duration
- TimelineTrack for audio tracks (BGM blue, SFX green) positioned at start/end times
- Transition icons between clips, current time indicator (red line)

### Subtitle Editor
- Controls: font family (5 Korean fonts), size slider (16-72px), font/background/border/shadow colors, position toggle (top/center/bottom)
- Live 9:16 SubtitlePreview with CSS-applied styling
- Debounced onChange (300ms)

### Transition Picker
- 6 types in 2x3 grid: fade, dissolve, slide-left, slide-right, zoom-in, cut
- Duration slider (0.2-1.0s) hidden for 'cut' type
- Korean labels with Lucide icons

### Audio Track Manager
- Add from built-in library (5 BGM + 5 SFX entries) or file upload
- AudioWaveform using wavesurfer.js (bar style, no interaction)
- Per-track volume slider, start/end time inputs, delete button
- AudioLibraryDialog with play preview, category badges

### Video Preview
- 9:16 aspect ratio canvas (360px wide)
- Scene-by-scene preview with subtitle overlay and auto-advance
- Vidstack web component player for exported video URL
- Play/pause, prev/next scene controls

### Export Button
- 4 states: idle, rendering (with progress bar), complete (download link), failed (retry)
- Uses useExportJob hook with 2s polling

### Voice Tab (Tab 3)
- TTS section: per-scene narration status, play/pause, bulk generate
- Audio track management section (AudioTrackManager)
- "Next: final video" button

### Video Tab (Tab 4)
- 2-column layout: preview + edit panel (subtitle editor + transition picker)
- Timeline below, export button at bottom
- Scene selection syncs editors via useSceneSettings hook

### Workflow Tabs
- All 4 tabs enabled (removed `tab.step > 2` guard)
- Parent page wires VoiceTab and VideoTab with script/scene data

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vidstack React integration**
- **Found during:** Task 8
- **Issue:** Plan referenced `@vidstack/react` (MediaPlayer, MediaProvider) but installed `vidstack` uses web components
- **Fix:** Used vidstack web component imports (`media-player`, `media-provider`) with React 19 JSX type declarations via `declare module "react"`
- **Files modified:** src/components/video/video-preview.tsx

**2. [Rule 3 - Blocking] Missing shadcn UI components**
- **Found during:** Task 5
- **Issue:** Slider, Select, ToggleGroup, Dialog, Progress components not yet installed
- **Fix:** Added via `npx shadcn@latest add slider select toggle-group dialog progress`
- **Files modified:** 6 new UI component files

**3. [Rule 1 - Bug] Vitest setup crashes in node environment**
- **Found during:** Task 13
- **Issue:** `Element.prototype` polyfill in vitest.setup.ts threw ReferenceError in node environment tests
- **Fix:** Guarded with `typeof globalThis.Element !== "undefined"` check; removed non-functional `environmentMatchGlobs`
- **Files modified:** vitest.setup.ts, vitest.config.ts
- **Commit:** 45de41b

**4. [Rule 3 - Blocking] Missing test dependencies**
- **Found during:** Task 5
- **Issue:** @testing-library/react, @testing-library/jest-dom, jsdom not installed
- **Fix:** Installed as devDependencies, created vitest.setup.ts with jest-dom matchers and Radix polyfills

## Test Results

All 25 test files pass (169 tests total):
- src/__tests__/timeline.test.tsx (3 tests)
- src/__tests__/subtitle-editor.test.tsx (2 tests)
- src/__tests__/export-button.test.tsx (2 tests)
- Plus 22 pre-existing test files (162 tests)

TypeScript: No new errors (4 pre-existing errors in queuedash/signin modules).

## Known Stubs

None. Audio library entries use placeholder URLs (`/audio/library/*.mp3`) which are intentional -- the plan specifies these as placeholders to be replaced with actual hosted files in production.

## Self-Check: PASSED

All 22 created files verified present. All 14 commit hashes verified in git log.
