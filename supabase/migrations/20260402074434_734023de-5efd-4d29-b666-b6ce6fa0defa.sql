-- Make bucket private
UPDATE storage.buckets SET public = false WHERE id = 'scene-videos';

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload own videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'scene-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to view their own videos
CREATE POLICY "Users can view own videos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'scene-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to delete their own videos
CREATE POLICY "Users can delete own videos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'scene-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to update their own videos
CREATE POLICY "Users can update own videos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'scene-videos' AND (storage.foldername(name))[1] = auth.uid()::text);