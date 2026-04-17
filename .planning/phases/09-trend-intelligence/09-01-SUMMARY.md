# Plan 09-01 Summary

**Status**: DONE_WITH_CONCERNS
**Duration**: ~25 minutes
**Tasks**: 9/9

## Tasks Completed

- Task 1: Extend schema.ts with trend tables ✅ 93d1a23
- Task 2: Generate Drizzle migration 0006_phase9_trends.sql ✅ 0ed1b63
- Task 3: Hand-written RLS policies for trend tables ✅ b7cd44f
- Task 4: Add CRON_SECRET and GOOGLE_TRENDS_ENABLED to env.ts ✅ 9741117
- Task 5: Extract canonical TopicRecommendation type with trendBadge ✅ 2b9fcf2
- Task 6: Add ingest-trends and precompute-gap-rationales to ALLOWED_JOB_TYPES ✅ d4a0553
- Task 7: Processor switch + stub handlers ✅ 6583ce2
- Task 8: Phase9 schema smoke test (3 tests) ✅ 2569154
- Task 9: TopicRecommendation shared-type smoke test (2 tests) ✅ 53a8250

## Deviations

1. **Task 5 — TopicRecommendation already existed in `src/lib/ai/types.ts`**: The interface was already declared (without `trendBadge`). Instead of appending a duplicate, the existing interface was updated in-place to add the `trendBadge` optional field. The `BenchmarkAnalysisResult.topicRecommendations` already used this type so no additional update was needed there. The topic-picker.tsx inline interface was removed and replaced with the shared import as planned.

2. **Task 2 — Drizzle-kit emitted the expression index correctly**: No fallback was needed. Drizzle-kit generated `(\"recorded_at\"::date)` in the unique index as-is; the migration file was not hand-edited.

3. **Pre-existing TypeScript errors**: `bunx tsc --noEmit` exits 2 with errors in files outside plan scope (`projects/[id]/page.tsx`, `signin/form.tsx`, `queuedash` routes). These errors existed before plan 09-01 and are not caused by any plan changes. No plan-scope files have TypeScript errors.

4. **Pre-existing test failure**: `avatar-seed-script.test.ts` fails in the local environment (confirmed pre-existing before plan changes — likely a missing binary or file-system path issue). All 5 new tests pass.

## Acceptance Criteria

- [x] `src/lib/db/schema.ts` exports `trendSnapshots`, `trendGapAnalyses`, `trendIngestionRuns` — verified via schema smoke test
- [x] `trend_snapshots` has columns id, recorded_at, category_id, region_code, keyword, rank, source, video_count, raw_payload, created_at — verified by smoke test
- [x] `trend_snapshots` has unique index on `(date(recorded_at), category_id, region_code, keyword, source)` — confirmed in migration SQL line 44
- [x] `trend_snapshots` has secondary index on `(recorded_at, category_id, region_code)` — confirmed in migration SQL line 45
- [x] `trend_ingestion_runs` has required columns with no user_id — verified by smoke test + grep
- [x] `trend_gap_analyses` has FK user_id NOT NULL to user.id, FK project_id nullable, unique index — confirmed in schema + migration
- [x] `jobs.userId NOT NULL` is untouched — confirmed via grep: `user_id text notNull().references(user.id)` at schema line 133 unchanged
- [x] `drizzle/0006_phase9_trends.sql` exists — `bunx drizzle-kit check` exits 0
- [x] `supabase/migrations/rls_trends.sql` exists with `auth.uid()::text` for trend_gap_analyses and deny-all for trend_ingestion_runs
- [x] `src/lib/env.ts` includes `CRON_SECRET: z.string().min(16)` and `GOOGLE_TRENDS_ENABLED` with boolean transform
- [x] `src/lib/ai/types.ts` exports `TopicRecommendation` with optional `trendBadge` field
- [x] `src/components/project/topic-picker.tsx` imports `TopicRecommendation` from `@/lib/ai/types` (no inline interface)
- [x] `src/lib/db/schema.ts` `analyses.topicRecommendations` uses imported `TopicRecommendation[]` type
- [x] `ALLOWED_JOB_TYPES` includes `"ingest-trends"` and `"precompute-gap-rationales"` — grep confirmed
- [x] POST /api/jobs with type=ingest-trends returns 403 — guard block at route.ts line 161
- [x] POST /api/jobs with type=precompute-gap-rationales where payload.userId differs from session.user.id and not admin returns 403 — guard block at route.ts line 170
- [x] `src/worker/processor.ts` switch handles both new types
- [x] `src/worker/handlers/ingest-trends.ts` and `precompute-gap-rationales.ts` exist as stubs that throw not-implemented
- [x] `bunx drizzle-kit check` exits 0 — "Everything's fine"
- [x] `bun run test src/__tests__/phase9-schema.test.ts` passes 3 tests
- [x] `bun run test src/__tests__/phase9-topic-recommendation-type.test.ts` passes 2 tests

## Lint Status

lint_status = FAIL (pre-existing errors, not introduced by this plan)

## Lint Errors (first 10 lines — all pre-existing, outside plan scope)

```
src/app/(dashboard)/projects/[id]/page.tsx(14,10): error TS2724: '"@/components/distribution/seo-preview"' has no exported member named 'SeoPreview'. Did you mean 'SEOPreview'?
src/app/(dashboard)/projects/[id]/page.tsx(271,34): error TS2322: Type '{ projectId: string; }' is not assignable to type 'IntrinsicAttributes & ViralScoreDisplayProps'.
src/app/(dashboard)/projects/[id]/page.tsx(273,33): error TS2322: Type '{ projectId: string; }' is not assignable to type 'IntrinsicAttributes & ThumbnailGalleryProps'.
src/app/(dashboard)/projects/[id]/page.tsx(274,16): error TS2739: Type '{ projectId: string; }' is missing the following properties from type 'UploadPanelProps': hasExportedVideo, seo, selectedThumbnailId, supabaseJwt
src/app/(routes)/(auth)/signin/form.tsx(38,37): error TS2339: Property 'username' does not exist on type ...
src/app/admin/queuedash/[[...slug]]/page.tsx(3,30): error TS2307: Cannot find module '@queuedash/ui'
src/app/api/queuedash/[...trpc]/route.ts(1,37): error TS2307: Cannot find module '@trpc/server/adapters/fetch'
src/app/api/queuedash/[...trpc]/route.ts(2,27): error TS2307: Cannot find module '@queuedash/api'
```

None of these files were touched by plan 09-01. All plan-scope files have zero TypeScript errors.

## Concerns

1. **Pre-existing lint errors** in `projects/[id]/page.tsx` (SEOPreview rename, ViralScoreDisplayProps mismatch, UploadPanelProps shape change) and `queuedash` routes. These are architectural regressions from Phase 8 that should be addressed before Phase 9 plans that touch those pages.

2. **CRON_SECRET not set in test env**: The `CRON_SECRET` env var is required (min 16 chars) and will fail at runtime if unset. Tests that mock env don't encounter this issue. If any integration test imports `env.ts` directly without mocking it, it will fail. No such test was found, but this should be verified when Phase 9 cron route tests are added in 09-02.
