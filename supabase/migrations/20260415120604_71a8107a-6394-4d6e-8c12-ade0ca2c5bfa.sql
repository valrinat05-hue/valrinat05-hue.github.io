DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'Builder mode can manage projects'
  ) THEN
    CREATE POLICY "Builder mode can manage projects"
    ON public.projects
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'scenes' AND policyname = 'Builder mode can manage scenes'
  ) THEN
    CREATE POLICY "Builder mode can manage scenes"
    ON public.scenes
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'scene_videos' AND policyname = 'Builder mode can manage scene videos'
  ) THEN
    CREATE POLICY "Builder mode can manage scene videos"
    ON public.scene_videos
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Builder mode can view scene videos bucket'
  ) THEN
    CREATE POLICY "Builder mode can view scene videos bucket"
    ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (bucket_id = 'scene-videos');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Builder mode can upload scene videos bucket'
  ) THEN
    CREATE POLICY "Builder mode can upload scene videos bucket"
    ON storage.objects
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (bucket_id = 'scene-videos');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Builder mode can update scene videos bucket'
  ) THEN
    CREATE POLICY "Builder mode can update scene videos bucket"
    ON storage.objects
    FOR UPDATE
    TO anon, authenticated
    USING (bucket_id = 'scene-videos')
    WITH CHECK (bucket_id = 'scene-videos');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Builder mode can delete scene videos bucket'
  ) THEN
    CREATE POLICY "Builder mode can delete scene videos bucket"
    ON storage.objects
    FOR DELETE
    TO anon, authenticated
    USING (bucket_id = 'scene-videos');
  END IF;
END
$$;