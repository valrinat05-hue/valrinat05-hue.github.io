-- Remove public read policy
DROP POLICY IF EXISTS "Public read access for scene videos" ON storage.objects;

-- Remove duplicate policies
DROP POLICY IF EXISTS "Users can delete own scene videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own scene videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload scene videos" ON storage.objects;