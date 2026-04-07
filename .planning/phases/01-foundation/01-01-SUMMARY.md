---
plan: 01-01
title: Scaffold app, auth, DB schema, crypto, API keys, project CRUD
phase: 1
wave: 1
status: completed
lint_status: PARTIAL
executed_at: 2026-04-07T17:19:45Z
executor_model: claude-opus-4-6
---

# Plan 01-01: Scaffold app, auth, DB schema, crypto, API keys, project CRUD -- Execution Summary

## Objective Achieved

Cloned the nextjs-better-auth fork and built the complete foundation layer: better-auth with email + Google OAuth, 4 custom Drizzle tables (api_keys, projects, jobs, job_events), AES-256-GCM envelope encryption for API key storage, API key CRUD with masked responses, project CRUD with workflow state, auth-guarded dashboard layout, and comprehensive test coverage (41 tests passing). Google OAuth verification and YouTube API quota tracking checklist created for the 4-8 week verification process.

## Tasks Completed

| # | Task | Commit | Notes |
|---|------|--------|-------|
| 1 | Clone fork and install dependencies | 9327b10 | nextjs-better-auth + bullmq, ioredis, supabase-js, jose, vitest |
| 2 | Create environment variable schema | df8b12e | @t3-oss/env-nextjs with zod validation, .env.example |
| 3 | Define Drizzle schema with 4 custom tables | f8ba58d | api_keys, projects, jobs, job_events |
| 4 | Implement envelope encryption module | 661b03d | AES-256-GCM, DEK memory cleanup |
| 5 | Configure better-auth with email + Google OAuth | 1dcc0e5 | emailAndPassword + Google social provider |
| 6 | Build API key CRUD endpoints | 2478473 | POST/GET/DELETE with encryption, masked responses |
| 7 | Build project CRUD endpoints | f017ff8 | POST/GET/PATCH/DELETE with workflowState |
| 8 | Build auth UI pages (login + signup) | f097ca1 | Email + Google OAuth buttons |
| 9 | Build dashboard layout with auth guard | 2c8086a | Redirect to /login if unauthenticated |
| 10 | Build API key management UI | a0f5da4 | Form + masked list + delete confirmation |
| 11 | Build project list and detail UI | 59f283d | Card grid, create dialog, detail edit |
| 12 | Create Vitest config and unit tests for crypto | 87e9f58 | 18 tests: roundtrip, tamper detection, extractLast4 |
| 13 | Push DB schema with Drizzle Kit | 3b6093f | Updated drizzle.config.ts, added db:push script |
| 14 | Create unit tests for API key and project endpoints | f486e9b | 23 tests: auth guard, CRUD, ownership |
| 15 | Google OAuth verification checklist | 00a2d07 | Tracking doc for verification + quota requests |

## Key Files

### Created
- `src/lib/crypto.ts` -- AES-256-GCM envelope encryption with DEK memory cleanup
- `src/lib/env.ts` -- Type-safe env validation with @t3-oss/env-nextjs
- `src/lib/db/schema.ts` -- Drizzle schema with 4 custom tables + better-auth tables
- `src/app/api/api-keys/route.ts` -- API key CRUD (POST/GET/DELETE), encrypted storage
- `src/app/api/projects/route.ts` -- Project list and create endpoints
- `src/app/api/projects/[id]/route.ts` -- Project get, update, delete with ownership check
- `src/app/(auth)/login/page.tsx` -- Login page with email + Google OAuth
- `src/app/(auth)/signup/page.tsx` -- Signup page with email + Google OAuth
- `src/app/(dashboard)/layout.tsx` -- Auth-guarded dashboard layout
- `src/app/(dashboard)/settings/api-keys/page.tsx` -- API key management page
- `src/app/(dashboard)/projects/page.tsx` -- Project list page
- `src/app/(dashboard)/projects/[id]/page.tsx` -- Project detail page
- `src/components/api-key-form.tsx` -- API key registration form (password input)
- `src/components/api-key-list.tsx` -- Masked API key list display
- `src/components/project-list.tsx` -- Project card grid with create dialog
- `src/hooks/use-session.ts` -- better-auth session hook wrapper
- `vitest.config.ts` -- Vitest configuration with React plugin and path aliases
- `src/__tests__/crypto.test.ts` -- 18 encryption unit tests
- `src/__tests__/api-keys.test.ts` -- 10 API key endpoint tests
- `src/__tests__/projects.test.ts` -- 13 project endpoint tests
- `.env.example` -- Environment variable template
- `.planning/phases/01-foundation/oauth-verification-checklist.md` -- OAuth tracking

### Modified
- `package.json` -- Added dependencies and db scripts
- `drizzle.config.ts` -- Updated schema path and DATABASE_URL
- `src/app/api/projects/[id]/route.ts` -- Fixed z.record() for zod v4 compat

## Acceptance Criteria

| Criterion | Status | Notes |
|-----------|--------|-------|
| Fork cloned, dependencies installed | PASS | All required packages in package.json |
| Email + Google OAuth configured | PASS | better-auth with emailAndPassword + Google social provider |
| API key encryption (AES-256-GCM) | PASS | Envelope encryption, masked responses only |
| API key list shows only safe fields | PASS | provider, label, last4, createdAt, lastUsedAt |
| Project CRUD works | PASS | Create, list, get, update, delete with ownership check |
| Crypto unit tests pass | PASS | 18/18 tests passing |
| DB schema has 4 custom tables | PASS | api_keys, projects, jobs, job_events |
| API key endpoint tests pass | PASS | 10/10 tests passing |
| Project endpoint tests pass | PASS | 13/13 tests passing |
| OAuth verification checklist created | PASS | Tracking doc with all required items |
| npx vitest run passes | PASS | 41/41 tests, 3 test files |
| npx tsc --noEmit passes | PARTIAL | 1 pre-existing error in fork's signin/form.tsx (not our code) |

## Lint Gate

**Status:** PARTIAL

- `npx vitest run` -- PASS (41/41 tests, 3 files)
- `npx tsc --noEmit` -- 1 pre-existing error in `src/app/(routes)/(auth)/signin/form.tsx` from the fork (property 'username' does not exist on signIn.social). This file was not modified by any task in this plan -- it arrived with the fork clone (commit 9327b10).

## Deviations

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed z.record() validation for zod v4**
- **Found during:** Task 14 (tests)
- **Issue:** `z.record(z.boolean())` in the projects PATCH route failed validation in zod v4, which requires explicit key type
- **Fix:** Changed to `z.record(z.string(), z.boolean())`
- **Files modified:** `src/app/api/projects/[id]/route.ts`
- **Commit:** f486e9b (included with task 14)

### Pre-existing Issues (Out of Scope)

**1. Fork TypeScript error in signin/form.tsx**
- `Property 'username' does not exist on type` -- the fork's original signin form references a `username` method on better-auth's signIn.social that doesn't exist in the installed version. This was not introduced by our changes and is outside the plan scope.

## Self-Check

- [x] `src/lib/crypto.ts` -- FOUND
- [x] `src/lib/env.ts` -- FOUND
- [x] `src/lib/db/schema.ts` -- FOUND
- [x] `src/app/api/api-keys/route.ts` -- FOUND
- [x] `src/app/api/projects/route.ts` -- FOUND
- [x] `src/app/api/projects/[id]/route.ts` -- FOUND
- [x] `vitest.config.ts` -- FOUND
- [x] `src/__tests__/crypto.test.ts` -- FOUND
- [x] `src/__tests__/api-keys.test.ts` -- FOUND
- [x] `src/__tests__/projects.test.ts` -- FOUND
- [x] `.planning/phases/01-foundation/oauth-verification-checklist.md` -- FOUND
- [x] Commit 87e9f58 -- FOUND
- [x] Commit 3b6093f -- FOUND
- [x] Commit f486e9b -- FOUND
- [x] Commit 00a2d07 -- FOUND

## Self-Check: PASSED
