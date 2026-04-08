---
plan: 02-02
title: Transcript collection, channel/video browsing UI, transcript viewer
phase: 2
wave: 2
status: completed
lint_status: PASS
executed_at: 2026-04-08T10:15:00Z
executor_model: claude-opus-4-6
---

# Plan 02-02: Transcript collection, channel/video browsing UI, transcript viewer -- Execution Summary

## Objective Achieved

Built the complete Channel Intelligence user journey: installed youtube-transcript for zero-quota subtitle extraction via InnerTube, created a transcript fetching utility with ko/en/auto language priority (D-08), added a BullMQ transcript-collect handler that batch-collects transcripts for top N videos with progress tracking and skip-if-exists logic, created a transcript API endpoint, and built the full UI layer -- channel import form, keyword search with quota warning, channel list/card, video table with all CORE-02 metrics (thumbnail, title, views, subscribers, performance score, engagement rate, likes, comments, date, duration), transcript collect button with realtime progress via Supabase, and transcript viewer with timestamped segments. All 82 tests pass (11 new). TypeScript compiles cleanly for all new files (pre-existing errors in queuedash and signin/form.tsx are unrelated).

## Tasks Completed
| # | Task | Commit | Notes |
|---|------|--------|-------|
| 2-02-01 | Install youtube-transcript package | 1db3166 | Zero API quota cost via InnerTube |
| 2-02-02 | Create transcript fetching utility | 12a08d9 | ko/en/auto priority + STT placeholder |
| 2-02-03 | Add transcript-collect to jobs API + processor | 59aa8b0 | ALLOWED_JOB_TYPES + switch case |
| 2-02-04 | Create transcript-collect BullMQ handler | d3dc08f | Batch collect top N, skip existing, progress tracking |
| 2-02-05 | Create transcript API endpoint | a169ad8 | GET /api/channels/[id]/videos/[videoId]/transcript |
| 2-02-06 | Create channel import form component | b104917 | URL/handle validation with zod |
| 2-02-07 | Create channel search component | c12ee78 | Keyword search with 100 units quota warning |
| 2-02-08 | Create channel card + list components | a3300f6 | Subscriber/video/view counts, delete action |
| 2-02-09 | Create video table component | 0be070b | All CORE-02 columns with sortable headers |
| 2-02-10 | Create transcript viewer + collect button | 34eec49 | Timestamped segments, realtime progress bar |
| 2-02-11 | Create channel list page | 48f291f | /channels with import + search + list |
| 2-02-12 | Create channel detail page | e2cdd56 | /channels/[id] with video table + transcript collect |
| 2-02-13 | Create video detail page | d827f9e | /channels/[id]/videos/[videoId] with transcript viewer |
| 2-02-14 | Create transcript tests | 2b5c90d | 11 tests covering data structure + handler logic |

## Key Files
### Created
- src/lib/youtube/transcript.ts -- fetchTranscript with language priority, STT fallback placeholder
- src/worker/handlers/transcript-collect.ts -- BullMQ handler for batch transcript collection
- src/app/api/channels/[id]/videos/[videoId]/transcript/route.ts -- Transcript API endpoint
- src/components/channel-import-form.tsx -- URL/handle import with zod validation
- src/components/channel-search.tsx -- Keyword search with quota cost warning
- src/components/channel-card.tsx -- Channel card with stats and delete
- src/components/channel-list.tsx -- Channel list with auto-fetch and refresh
- src/components/video-table.tsx -- Video table with all CORE-02 metric columns
- src/components/transcript-viewer.tsx -- Timestamped transcript segment viewer
- src/components/transcript-collect-button.tsx -- Job submission with realtime progress
- src/app/(dashboard)/channels/page.tsx -- Channel browsing dashboard
- src/app/(dashboard)/channels/[id]/page.tsx -- Channel detail with video table
- src/app/(dashboard)/channels/[id]/videos/[videoId]/page.tsx -- Video detail with transcript
- src/__tests__/transcript.test.ts -- 6 tests for transcript data structure
- src/__tests__/transcript-handler.test.ts -- 5 tests for handler logic

### Modified
- package.json -- Added youtube-transcript dependency
- src/app/api/jobs/route.ts -- Added transcript-collect to ALLOWED_JOB_TYPES
- src/worker/processor.ts -- Added handleTranscriptCollect case

## Acceptance Criteria
| Criterion | Status | Notes |
|-----------|--------|-------|
| youtube-transcript installed | PASS | In package.json dependencies |
| transcript-collect in ALLOWED_JOB_TYPES | PASS | jobs/route.ts |
| transcript-collect in processor switch | PASS | processor.ts |
| Transcript utility with ko/en/auto fallback | PASS | transcript.ts |
| BullMQ handler collects top N transcripts | PASS | transcript-collect.ts |
| Transcript API returns segments/fullText | PASS | transcript/route.ts |
| ChannelImportForm with validation | PASS | channel-import-form.tsx |
| ChannelSearch with quota warning | PASS | channel-search.tsx |
| ChannelCard + ChannelList | PASS | channel-card.tsx, channel-list.tsx |
| VideoTable with all CORE-02 columns | PASS | video-table.tsx |
| TranscriptCollectButton with realtime progress | PASS | transcript-collect-button.tsx |
| TranscriptViewer with timestamps | PASS | transcript-viewer.tsx |
| Dashboard pages: /channels, /channels/[id], /channels/[id]/videos/[videoId] | PASS | 3 pages created |
| All tests pass | PASS | 82/82 (vitest run) |
| TypeScript clean (new files) | PASS | No errors in 02-02 files |

## Lint Gate
- **vitest**: 82 tests passed, 0 failed
- **tsc --noEmit**: 4 pre-existing errors (queuedash modules, signin form) -- 0 errors from this plan's files

## Deviations from Plan
None -- plan executed exactly as written.

## Known Stubs
- `fetchTranscriptViaStt` in `src/lib/youtube/transcript.ts` returns null (Google STT fallback deferred to D-09, documented in plan)
