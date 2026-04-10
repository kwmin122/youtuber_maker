-- Enable RLS on Phase 8 tables
ALTER TABLE "avatar_presets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "avatar_assets" ENABLE ROW LEVEL SECURITY;

-- avatar_presets: users see global (user_id IS NULL) + their own custom rows
CREATE POLICY "avatar_presets_select_global_or_own"
  ON "avatar_presets" FOR SELECT
  USING (user_id IS NULL OR user_id = auth.uid()::text);

-- Users can only INSERT custom presets scoped to themselves. Global rows
-- are inserted by the seed script through the service-role client, which
-- bypasses RLS.
CREATE POLICY "avatar_presets_insert_own"
  ON "avatar_presets" FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "avatar_presets_update_own"
  ON "avatar_presets" FOR UPDATE
  USING (user_id = auth.uid()::text);

CREATE POLICY "avatar_presets_delete_own"
  ON "avatar_presets" FOR DELETE
  USING (user_id = auth.uid()::text);

-- avatar_assets: strictly per-user
CREATE POLICY "avatar_assets_select_own"
  ON "avatar_assets" FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "avatar_assets_insert_own"
  ON "avatar_assets" FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "avatar_assets_update_own"
  ON "avatar_assets" FOR UPDATE
  USING (user_id = auth.uid()::text);

CREATE POLICY "avatar_assets_delete_own"
  ON "avatar_assets" FOR DELETE
  USING (user_id = auth.uid()::text);
