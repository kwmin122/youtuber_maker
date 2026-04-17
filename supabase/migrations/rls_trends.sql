-- Enable RLS on Phase 9 tables
ALTER TABLE "trend_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trend_ingestion_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trend_gap_analyses" ENABLE ROW LEVEL SECURITY;

-- trend_snapshots: any authenticated caller may SELECT.
-- Writes only via service-role (cron handler bypasses RLS).
CREATE POLICY "trend_snapshots_select_any_auth"
  ON "trend_snapshots" FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- trend_ingestion_runs: deny-all to anon/auth clients. Only service-role
-- (which bypasses RLS) may read/write. The /trends dashboard fetches
-- "last successful run" via a server component that uses the Drizzle
-- client, NOT the anon Supabase client.
CREATE POLICY "trend_ingestion_runs_deny_all"
  ON "trend_ingestion_runs" FOR ALL
  USING (false)
  WITH CHECK (false);

-- trend_gap_analyses: strictly per-user.
CREATE POLICY "trend_gap_analyses_select_own"
  ON "trend_gap_analyses" FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "trend_gap_analyses_insert_own"
  ON "trend_gap_analyses" FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "trend_gap_analyses_update_own"
  ON "trend_gap_analyses" FOR UPDATE
  USING (user_id = auth.uid()::text);

CREATE POLICY "trend_gap_analyses_delete_own"
  ON "trend_gap_analyses" FOR DELETE
  USING (user_id = auth.uid()::text);
