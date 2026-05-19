-- Tighten template-images bucket read policy to prevent draft leakage
-- Replaces any existing permissive read policies

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'objects'
    AND schemaname = 'storage'
    AND cmd = 'SELECT'
    AND (qual LIKE '%template-images%' OR qual LIKE '%template_images%')
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON storage.objects';
  END LOOP;
END $$;

-- Allow reads for:
-- 1. A user's own files (their folder = their user_id)
-- 2. Images attached to a published template (public marketplace display)
CREATE POLICY "Scoped read for template-images bucket"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'template-images'
  AND (
    (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = auth.uid()::text)
    OR
    EXISTS (
      SELECT 1
      FROM template_images ti
      JOIN templates t ON t.id = ti.template_id
      WHERE ti.storage_path = name
        AND t.status = 'published'
    )
  )
);
