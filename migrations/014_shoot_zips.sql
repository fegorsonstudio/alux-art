-- shoot-zips: private bucket for cached ZIP downloads (100 MB limit per file)
INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES ('shoot-zips', 'shoot-zips', false, ARRAY['application/zip'], 104857600)
ON CONFLICT DO NOTHING;

-- ZIP cache columns on shoots table
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS zip_storage_path TEXT;
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS zip_storage_bucket TEXT DEFAULT 'shoot-zips';
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS zip_status TEXT;

-- Allow owners and service role to read their own ZIP files
CREATE POLICY "owner reads own zip"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'shoot-zips'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "service role writes shoot zips"
  ON storage.objects FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'shoot-zips');

CREATE POLICY "service role updates shoot zips"
  ON storage.objects FOR UPDATE TO service_role
  USING (bucket_id = 'shoot-zips');
