-- Enable RLS on longform tables
ALTER TABLE "longform_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "longform_candidates" ENABLE ROW LEVEL SECURITY;

-- longform_sources: users can only see their own
CREATE POLICY "longform_sources_select_own"
  ON "longform_sources" FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "longform_sources_insert_own"
  ON "longform_sources" FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "longform_sources_update_own"
  ON "longform_sources" FOR UPDATE
  USING (user_id = auth.uid()::text);

CREATE POLICY "longform_sources_delete_own"
  ON "longform_sources" FOR DELETE
  USING (user_id = auth.uid()::text);

-- longform_candidates: derived ownership via source
CREATE POLICY "longform_candidates_select_own"
  ON "longform_candidates" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "longform_sources"
      WHERE "longform_sources"."id" = "longform_candidates"."source_id"
        AND "longform_sources"."user_id" = auth.uid()::text
    )
  );

CREATE POLICY "longform_candidates_insert_own"
  ON "longform_candidates" FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "longform_sources"
      WHERE "longform_sources"."id" = "longform_candidates"."source_id"
        AND "longform_sources"."user_id" = auth.uid()::text
    )
  );

CREATE POLICY "longform_candidates_update_own"
  ON "longform_candidates" FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "longform_sources"
      WHERE "longform_sources"."id" = "longform_candidates"."source_id"
        AND "longform_sources"."user_id" = auth.uid()::text
    )
  );

CREATE POLICY "longform_candidates_delete_own"
  ON "longform_candidates" FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "longform_sources"
      WHERE "longform_sources"."id" = "longform_candidates"."source_id"
        AND "longform_sources"."user_id" = auth.uid()::text
    )
  );
