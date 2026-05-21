
-- Fix scene_videos UPDATE policy to include is_allowed_user check
DROP POLICY IF EXISTS "Users can update own scene videos" ON public.scene_videos;
CREATE POLICY "Users can update own scene videos"
  ON public.scene_videos FOR UPDATE TO authenticated
  USING (
    is_allowed_user(auth.uid()) AND EXISTS (
      SELECT 1 FROM scenes JOIN projects ON projects.id = scenes.project_id
      WHERE scenes.id = scene_videos.scene_id AND projects.user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_allowed_user(auth.uid()) AND EXISTS (
      SELECT 1 FROM scenes JOIN projects ON projects.id = scenes.project_id
      WHERE scenes.id = scene_videos.scene_id AND projects.user_id = auth.uid()
    )
  );

-- Lock down user_allowlist - only service_role should manage it
REVOKE INSERT, UPDATE, DELETE ON public.user_allowlist FROM authenticated, anon;
