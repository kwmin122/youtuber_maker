-- PRIVATE bucket for user-uploaded reference photos used to build
-- custom avatar presets (Phase 8 decision D-04). Must be private so
-- portrait images are never served through a public URL — all reads
-- go through service-role signed URLs issued by the API.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatar-references',
  'avatar-references',
  false, -- PRIVATE
  20971520, -- 20 MB
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Path prefix scoping: <userId>/<uuid>.ext
-- These policies are defense-in-depth. The primary ownership check
-- lives in the Drizzle query path (src/app/api/avatar/assets/*).
CREATE POLICY "avatar_references_read_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'avatar-references'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatar_references_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatar-references'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatar_references_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatar-references'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
