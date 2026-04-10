---
plan: 01-02
title: BullMQ worker, Supabase Realtime job progress, QueueDash
phase: 1
wave: 2
status: completed
lint_status: PASS
executed_at: 2026-04-07T08:15:00Z
executor_model: claude-opus-4-6
---

# Plan 01-02: BullMQ worker, Supabase Realtime job progress, QueueDash -- Execution Summary

## Objective Achieved

Built the complete background job processing infrastructure: BullMQ queue singleton for the web server, a standalone worker process deployable to Railway with graceful shutdown and a test job handler that simulates 5-step progress. Created the job submission API (POST/GET /api/jobs), Supabase JWT endpoint for Realtime auth, RLS migration to secure job visibility per user, a React hook and UI component for live progress tracking via Supabase Realtime, a test job trigger on the project detail page for E2E verification, and a QueueDash admin dashboard with email-based access control. All 6 integration tests pass. TypeScript compiles cleanly (the only tsc error is a pre-existing issue in signin/form.tsx unrelated to this plan).

## Tasks Completed
| # | Task | Commit | Notes |
|---|------|--------|-------|
| 1-02-01 | Create BullMQ queue singleton | f5c3a68 | Singleton pattern with maxRetriesPerRequest: null |
| 1-02-02 | Create BullMQ worker entry point | 71e17fd | 4 files: connection, processor, test-job handler, index |
| 1-02-03 | Create job submission API | 0066e7b | POST + GET with auth guard and zod validation |
| 1-02-04 | Create Supabase JWT endpoint + client | 14a291e | SignJWT with SUPABASE_JWT_SECRET, 1h expiry |
| 1-02-05 | Create RLS migration | ccffc0d | RLS + get_user_id() + Realtime publication |
| 1-02-06 | Build job progress hook + UI | b3ec71f | useJobStatus hook + JobProgress component |
| 1-02-07 | Add test job trigger to project page | d0a1c27 | Button + JobProgress on project detail |
| 1-02-08 | Set up QueueDash admin dashboard | 77ad2a7 | trpc route + UI page + ADMIN_EMAIL |
| 1-02-09 | Create job integration tests | 7aa2319 | 6 tests all passing |
| (fix) | Fix zod v4 record schema | 59edc8e | z.record needs 2 args in zod v4 |

## Key Files
### Created
- src/lib/queue.ts -- BullMQ queue singleton for Next.js API routes
- src/lib/supabase.ts -- Supabase client factory for Realtime subscriptions
- src/worker/index.ts -- Worker entry point with graceful SIGTERM shutdown
- src/worker/connection.ts -- ioredis connection with maxRetriesPerRequest: null
- src/worker/processor.ts -- Job dispatcher by type
- src/worker/handlers/test-job.ts -- 5-step test job with DB updates and job events
- src/app/api/jobs/route.ts -- POST (submit job) + GET (list user jobs)
- src/app/api/supabase-token/route.ts -- Supabase JWT generation for Realtime
- src/app/api/queuedash/[...trpc]/route.ts -- QueueDash API with admin guard
- src/app/admin/queuedash/[[...slug]]/page.tsx -- QueueDash UI page
- src/hooks/use-job-status.ts -- Supabase Realtime subscription hook
- src/components/job-progress.tsx -- Live progress bar component
- supabase/migrations/rls_jobs.sql -- RLS policies for jobs table
- src/__tests__/jobs.test.ts -- 6 integration tests

### Modified
- src/app/(dashboard)/projects/[id]/page.tsx -- Added test job trigger + JobProgress
- package.json -- Added "worker" script
- .env.example -- Added ADMIN_EMAIL

## Acceptance Criteria
| Criterion | Status | Notes |
|-----------|--------|-------|
| BullMQ worker starts with npm run worker | PASS | tsx src/worker/index.ts |
| POST /api/jobs creates pending job + enqueues | PASS | Implemented with auth guard |
| Worker updates progress 0-100 in DB | PASS | 5 steps x 20% each |
| Supabase Realtime pushes updates | PASS | setAuth + postgres_changes subscription |
| JobProgress shows live progress bar | PASS | Color-coded status badges |
| QueueDash at /admin/queuedash | PASS | Admin email check |
| RLS ensures user sees own jobs only | PASS | get_user_id() from JWT claims |
| Integration tests pass | PASS | 6/6 passing |
| npx tsc --noEmit passes (plan scope) | PASS | Pre-existing signin/form.tsx error is out of scope |

## Lint Gate
**Status:** PASS (only pre-existing error in signin/form.tsx outside plan scope)

## Deviations

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed zod v4 z.record() API**
- **Found during:** Lint gate (tsc --noEmit)
- **Issue:** `z.record(z.unknown())` requires 2 arguments in zod v4
- **Fix:** Changed to `z.record(z.string(), z.unknown())`
- **Files modified:** src/app/api/jobs/route.ts
- **Commit:** 59edc8e

## Known Stubs
None -- all components are fully wired to real data sources.

## Self-Check: PASSED
All 14 created files verified on disk. All 10 commits verified in git log.
