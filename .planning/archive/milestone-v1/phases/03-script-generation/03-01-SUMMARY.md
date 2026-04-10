---
phase: 3
plan: 01
title: "AI provider abstraction, DB schema (analyses + scripts), benchmarking analysis API, topic recommendation"
subsystem: ai-provider, db-schema, worker-handler, api
tags: [ai, gemini, openai, byok, drizzle, bullmq, benchmarking]
dependency_graph:
  requires: [crypto, db, queue, auth, channels, transcripts]
  provides: [ai-provider, analyses-table, scripts-table, analyze-benchmark-job, analyses-api]
  affects: [jobs-api, worker-processor]
tech_stack:
  added: ["@google/generative-ai", "openai"]
  patterns: [provider-abstraction, byok-key-resolution, job-handler]
key_files:
  created:
    - src/lib/ai/types.ts
    - src/lib/ai/gemini.ts
    - src/lib/ai/openai.ts
    - src/lib/ai/provider.ts
    - src/lib/ai/get-user-ai-client.ts
    - src/lib/ai/prompts.ts
    - src/worker/handlers/analyze-benchmark.ts
    - src/app/api/projects/[id]/analyses/route.ts
    - src/__tests__/ai-provider.test.ts
    - src/__tests__/ai-prompts.test.ts
  modified:
    - package.json
    - src/lib/db/schema.ts
    - src/app/api/jobs/route.ts
    - src/worker/processor.ts
decisions:
  - "Provider priority: gemini first (cheaper), then openai"
  - "Gemini model: gemini-2.0-flash, OpenAI model: gpt-4o-mini"
  - "Transcript truncation at 3000 chars per video for prompt context management"
metrics:
  tasks_completed: 12
  tasks_total: 13
  tests_added: 10
  tests_total_passing: 92
  completed_date: "2026-04-08"
---

# Phase 3 Plan 01: AI Provider Abstraction + Benchmarking Analysis Summary

Provider-agnostic AI abstraction layer (Gemini + OpenAI) with BYOK key resolution, analyses/scripts DB tables, and analyze-benchmark BullMQ job handler for transcript tone/structure/hooking analysis with topic recommendations.

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 3-01-01 | Install AI SDK dependencies | f4cb183 | package.json |
| 3-01-02 | Create AI provider type definitions | fe941be | src/lib/ai/types.ts |
| 3-01-03 | Implement Gemini provider | 155b708 | src/lib/ai/gemini.ts |
| 3-01-04 | Implement OpenAI provider | 242cadb | src/lib/ai/openai.ts |
| 3-01-05 | Create provider factory with BYOK key resolution | c197345 | src/lib/ai/provider.ts, src/lib/ai/get-user-ai-client.ts |
| 3-01-06 | Create benchmarking analysis prompt template | d5dbbb0 | src/lib/ai/prompts.ts |
| 3-01-07 | Extend DB schema with analyses and scripts tables | 6110435 | src/lib/db/schema.ts |
| 3-01-08 | Register 'analyze-benchmark' job type | f8cbff5 | src/app/api/jobs/route.ts, src/worker/processor.ts |
| 3-01-09 | Implement analyze-benchmark job handler | cf50898 | src/worker/handlers/analyze-benchmark.ts |
| 3-01-10 | Create analyses API endpoint | b14c139 | src/app/api/projects/[id]/analyses/route.ts |
| 3-01-11 | Run DB migration | SKIPPED | (no DATABASE_URL in environment) |
| 3-01-12 | Unit tests for AI provider abstraction | a83c096 | src/__tests__/ai-provider.test.ts |
| 3-01-13 | Unit tests for prompt builder and parser | 325dad1 | src/__tests__/ai-prompts.test.ts |

## Deviations from Plan

### Skipped Task

**Task 3-01-11 (Run DB migration)** - `npm run db:push` requires DATABASE_URL environment variable pointing to a live PostgreSQL instance. The schema changes are correctly committed and will be applied when running in an environment with database access (e.g., `DATABASE_URL=... npm run db:push`).

## Verification Results

- All 92 tests pass (11 test files, 0 failures)
- No TypeScript errors in any new/modified files
- Pre-existing TS errors in unrelated files (signin/form.tsx, queuedash) -- out of scope

## Architecture Notes

- **AI Provider Layer**: `AIProvider` interface with `generateText()` method. Factory pattern routes to Gemini or OpenAI based on provider name. BYOK key resolution decrypts user's stored API key via envelope encryption.
- **Provider Priority**: gemini > openai (cost optimization). User can override with `preferredProvider`.
- **Prompt Design**: Korean-first prompt with JSON schema output. Transcripts truncated to 3000 chars each to stay within context limits.
- **Job Handler Pattern**: Follows same structure as transcript-collect handler -- progress tracking, job events, error handling with status updates.

## Known Stubs

None -- all functionality is fully wired.
