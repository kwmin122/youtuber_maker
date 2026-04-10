# Plan 08-02 Summary

**Status**: DONE_WITH_CONCERNS
**Duration**: ~25 minutes
**Tasks**: 6/6

## Tasks Completed

- Task 1: Curated fallback list ✅ fcbd001
- Task 2: Seed script with --dry-run ✅ f6dc8ec
- Task 3: (provider, providerAvatarId) unique index + migration ✅ ec10ec6
- Task 4: GET /api/avatar/presets + POST /api/avatar/presets/refresh ✅ d41d787
- Task 5: package.json seed:avatars script ✅ 97087d5
- Task 6: Tests (ownership isolation, dry-run subprocess, admin gate) ✅ 1041955

## Files Created/Modified

| File | Action | Commit |
|---|---|---|
| `src/lib/avatar/curated-fallback.ts` | NEW | fcbd001 |
| `scripts/seed-avatar-library.ts` | NEW | f6dc8ec |
| `src/lib/db/schema.ts` | MODIFIED (uniqueIndex added) | ec10ec6 |
| `drizzle/0004_phase8_avatar_unique_idx.sql` | NEW | ec10ec6 |
| `src/app/api/avatar/presets/route.ts` | NEW | d41d787 |
| `src/app/api/avatar/presets/refresh/route.ts` | NEW | d41d787 |
| `package.json` | MODIFIED (seed:avatars added) | 97087d5 |
| `src/__tests__/avatar-presets-api.test.ts` | NEW | 1041955 |
| `src/__tests__/avatar-seed-script.test.ts` | NEW | 1041955 |

## Test Counts

- Before: 360 passed | 1 skipped (361 total), 53 files
- After: 371 passed | 1 skipped (372 total), 55 files
- Delta: +11 tests, +2 test files

## Typecheck Status

`bunx tsc --noEmit` exits with 9 errors, all pre-existing except 1 new one in `src/app/api/avatar/assets/route.ts` (Plan 08-03 file created in 08-01). Pre-existing errors: signin/form.tsx (1), queuedash routes (3), projects/[id]/page.tsx (4). The avatar/assets/route.ts error (zod v4 literal API change) was introduced in 08-01 and is owned by Plan 08-03.

## Deviations

1. **Dry-run output row count**: With no admin API keys set, the seed script uses provider stubs (2 HeyGen + 1 D-ID = 3 rows) rather than the full curated fallback. This is because `getAdminAvatarProvider` with empty key uses `useStub=true`, which calls the stub library. The dry-run still exits 0 and prints the correct format. The curated fallback only activates when the stub returns empty or throws. This is expected behavior per the plan's risk section.

2. **`src/app/api/avatar/assets/route.ts` typecheck error**: This file belongs to Plan 08-03 and was created in 08-01. Zod v4 changed `z.literal()` to not accept an `errorMap` option. This plan did not introduce or modify this file. Plan 08-03 should fix it.

3. **Test DB mock approach**: The plan's test template used real DB inserts. Because the test environment uses the node environment without a live DB, I used a full mock of `@/lib/db` with an in-memory row array. The ownership isolation logic is faithfully tested via the mock filter logic that mirrors the real `isNull OR eq` condition.

## Acceptance Criteria

- [x] `curated-fallback.ts` exports `CURATED_FALLBACK` with exactly 12 entries, 6 HeyGen + 6 D-ID — verified by code
- [x] `scripts/seed-avatar-library.ts` exists and supports `--dry-run` — verified by dry-run run
- [x] `bun run scripts/seed-avatar-library.ts --dry-run` exits 0 and prints matching pattern — verified (subprocess test passes)
- [x] `avatarPresets` has uniqueIndex on `(provider, providerAvatarId)` — schema.ts modified, migration generated
- [x] Migration file contains `CREATE UNIQUE INDEX "avatar_presets_provider_id_idx"` — verified by `cat drizzle/0004_phase8_avatar_unique_idx.sql`
- [x] `GET /api/avatar/presets` exports GET, validates params via zod — implemented
- [x] Ownership: returns userId IS NULL OR userId = session.user.id — verified by test
- [x] `POST /api/avatar/presets/refresh` gated by ADMIN_USER_IDS env — verified by 4 admin gate tests
- [x] `package.json` contains `seed:avatars` script — verified by grep
- [x] `avatar-presets-api.test.ts` asserts foreign-user presets NOT returned — test passes
- [x] `avatar-seed-script.test.ts` subprocess dry-run passes — verified
- [x] `bun run test` exits 0 — 371 passed, 0 failed
- [ ] `bunx tsc --noEmit` exits 0 — 9 errors (8 pre-existing + 1 from 08-01 in 08-03-owned file)

## Concerns

1. `src/app/api/avatar/assets/route.ts` has a Zod v4 API incompatibility (`z.literal()` no longer accepts `errorMap`). Plan 08-03 owns this file and should fix it.
2. Stub behavior for `getAdminAvatarProvider` when no env keys are set: stubs return 2+1=3 entries rather than falling back to the curated 12 entries. The curated fallback only activates on error/empty response from the stub. Consider making the stub throw when `HEYGEN_ADMIN_API_KEY` / `DID_ADMIN_API_KEY` are not set, to force fallback to the curated list in dev.

## Unblocks

- **Plan 08-05 UI** (library grid): `GET /api/avatar/presets?gender=&ageGroup=&style=&provider=` is now live and returns global + user-owned presets. The UI grid can call this endpoint with filter params directly.
- **Plan 08-03**: Can proceed in parallel (Wave 2). The unique index migration should be applied before 08-03 runs `drizzle-kit push`.
