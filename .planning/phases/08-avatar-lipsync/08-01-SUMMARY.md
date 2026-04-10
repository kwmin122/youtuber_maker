# Plan 08-01 Summary

**Status**: DONE
**Duration**: ~25 minutes
**Tasks**: 12/12

## Tasks Completed

- Task 1: Extend schema.ts — avatarPresets, avatarAssets tables + scenes/projects columns ✅ e4f124a
- Task 2: Generate Drizzle migration (drizzle/0003_phase8_avatar.sql) ✅ e4f124a
- Task 3: Hand-written RLS (supabase/migrations/rls_avatar.sql) ✅ e4f124a
- Task 4: Storage bucket SQL (supabase/migrations/avatar_references_bucket.sql, public=false) ✅ e4f124a
- Task 5: AvatarLipsyncProvider interface (src/lib/avatar/provider.ts) ✅ 637dd88
- Task 6: HeyGen REST client (src/lib/avatar/heygen-client.ts) ✅ 637dd88
- Task 7: D-ID REST client (src/lib/avatar/did-client.ts) ✅ 637dd88
- Task 8: BYOK-aware factory (src/lib/avatar/provider-factory.ts) ✅ 637dd88
- Task 9: ALLOWED_JOB_TYPES extended in src/app/api/jobs/route.ts ✅ 89fd58c
- Task 10: Processor switch + handler stub ✅ 89fd58c
- Task 11: .env.example updated with HEYGEN_API_KEY, D_ID_API_KEY ✅ 89fd58c
- Task 12: Unit tests (src/__tests__/avatar-provider-clients.test.ts, 5 cases) ✅ 115f8a1

## Files Created/Modified

### Created
- `drizzle/0003_phase8_avatar.sql`
- `supabase/migrations/rls_avatar.sql`
- `supabase/migrations/avatar_references_bucket.sql`
- `src/lib/avatar/provider.ts`
- `src/lib/avatar/heygen-client.ts`
- `src/lib/avatar/did-client.ts`
- `src/lib/avatar/provider-factory.ts`
- `src/worker/handlers/generate-avatar-lipsync.ts`
- `src/__tests__/avatar-provider-clients.test.ts`

### Modified
- `src/lib/db/schema.ts`
- `src/app/api/jobs/route.ts`
- `src/worker/processor.ts`
- `.env.example`

## Test Counts

- Before: 355 tests (53 test files)
- After: 360 tests (54 test files, +5 new)
- New: `avatar-provider-clients.test.ts` — 5 cases all passing

## Typecheck Status

`bunx tsc --noEmit` exits with exactly 8 pre-existing baseline errors (signin/form.tsx, queuedash, projects/[id]/page.tsx). Zero new errors from Phase 8 code.

## Deviations

None. Forward-reference FK pattern worked correctly — drizzle-kit resolved `avatarPresets.id` references from both `projects.defaultAvatarPresetId` and `scenes.avatarPresetId` without needing the hand-append fallback described in Task 2.

## Acceptance Criteria

- [x] `avatarPresets` and `avatarAssets` exported from schema.ts
- [x] `projects` has `default_avatar_preset_id` column
- [x] `scenes` has `avatar_preset_id`, `avatar_layout`, `avatar_video_url`, `avatar_provider_task_id`
- [x] `drizzle/0003_phase8_avatar.sql` creates both tables and adds 5 columns with FK constraints
- [x] `rls_avatar.sql` enables RLS on both tables with per-user + global-select policies
- [x] `avatar_references_bucket.sql` has `public=false`, 20 MB, image MIME whitelist
- [x] `provider.ts` exports all 6 required types/interfaces
- [x] `heygen-client.ts` exports HeyGenClient with working stub mode
- [x] `did-client.ts` exports DIDClient with working stub mode
- [x] `provider-factory.ts` exports getUserAvatarProvider and getAdminAvatarProvider
- [x] `ALLOWED_JOB_TYPES` contains "generate-avatar-lipsync"
- [x] processor.ts dispatches to handleGenerateAvatarLipsync
- [x] handler stub throws "not implemented — see Plan 08-04"
- [x] .env.example has HEYGEN_API_KEY and D_ID_API_KEY
- [x] 5 test cases pass
- [x] bun run test exits 0 (360 tests pass)
- [x] bunx tsc --noEmit clean (8 pre-existing errors only)

## Next Plans Unblocked

- **08-02** (Wave 2): Seed Script + Library API — depends on avatarPresets table and getAdminAvatarProvider
- **08-03** (Wave 2): Reference Image Upload + Consent — depends on avatarAssets table, storage bucket, and RLS
