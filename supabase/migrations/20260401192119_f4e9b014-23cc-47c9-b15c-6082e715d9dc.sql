
-- Create storage bucket for scene videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('scene-videos', 'scene-videos', true);

-- Allow authenticated users to upload files to their own folder
CREATE POLICY "Users can upload scene videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'scene-videos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own files
CREATE POLICY "Users can update own scene videos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'scene-videos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own files
CREATE POLICY "Users can delete own scene videos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'scene-videos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access for playback
CREATE POLICY "Public read access for scene videos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'scene-videos');
