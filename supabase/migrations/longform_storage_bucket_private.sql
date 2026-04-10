-- Phase 7 retry 2, Codex CRITICAL-4: lock down the longform-sources bucket.
--
-- Before this migration the bucket was `public = true`, which made every
-- uploaded 2 GB user-owned source video world-readable by URL. The app
-- does not need public reads — workers use signed URLs (via the
-- service-role client) for internal downloads, and the UI never exposes
-- the raw `source.publicUrl` to end users.
--
-- This migration flips the bucket to private. Existing `rls_longform.sql`
-- already defines per-user storage policies keyed off
-- `storage.foldername(name)[1] = auth.uid()::text`, but those policies
-- rely on Supabase Auth sessions which Better Auth does not produce.
-- The primary access control is therefore the service-role client +
-- Drizzle-level ownership checks in worker handlers and API routes
-- (see `src/lib/supabase.ts` `getServiceRoleClient`). The storage
-- policies remain as defense-in-depth for any future path that does
-- use the anon client.

UPDATE storage.buckets
   SET public = false
 WHERE id = 'longform-sources';
