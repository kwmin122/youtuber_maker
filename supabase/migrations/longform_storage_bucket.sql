-- Bucket for user-uploaded longform source files and downloaded YouTube videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'longform-sources',
  'longform-sources',
  true,
  2147483648, -- 2 GB
  ARRAY['video/mp4','video/quicktime','video/webm','video/x-matroska']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Allow authenticated users to read their own files (path prefix = user_id)
CREATE POLICY "longform_sources_read_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'longform-sources'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "longform_sources_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'longform-sources'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "longform_sources_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'longform-sources'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
