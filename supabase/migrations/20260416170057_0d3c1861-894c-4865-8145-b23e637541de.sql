
-- 1. Drop the leftover "Builder mode" policy
DROP POLICY IF EXISTS "Builder mode can manage projects" ON public.projects;

-- 2. Create user_allowlist table
CREATE TABLE public.user_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(email)
);

ALTER TABLE public.user_allowlist ENABLE ROW LEVEL SECURITY;

-- Only allowlisted authenticated users can read the allowlist
CREATE POLICY "Allowlisted users can view allowlist"
  ON public.user_allowlist FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 3. Create a SECURITY DEFINER function to check allowlist
CREATE OR REPLACE FUNCTION public.is_allowed_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_allowlist WHERE user_id = _user_id
  )
$$;

-- 4. Seed the allowlist with the owner's email
-- We need to look up the user_id from auth.users by email
INSERT INTO public.user_allowlist (user_id, email)
SELECT id, email FROM auth.users WHERE email = 'valkaa767@gmail.com'
ON CONFLICT DO NOTHING;

-- 5. Update projects RLS policies to include allowlist check
DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
CREATE POLICY "Users can view own projects" ON public.projects
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND public.is_allowed_user(auth.uid()));

DROP POLICY IF EXISTS "Users can create own projects" ON public.projects;
CREATE POLICY "Users can create own projects" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_allowed_user(auth.uid()));

DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
CREATE POLICY "Users can update own projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.is_allowed_user(auth.uid()));

DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;
CREATE POLICY "Users can delete own projects" ON public.projects
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND public.is_allowed_user(auth.uid()));

-- 6. Update scenes RLS policies
DROP POLICY IF EXISTS "Users can view own scenes" ON public.scenes;
CREATE POLICY "Users can view own scenes" ON public.scenes
  FOR SELECT TO authenticated
  USING (public.is_allowed_user(auth.uid()) AND EXISTS (
    SELECT 1 FROM projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can create own scenes" ON public.scenes;
CREATE POLICY "Users can create own scenes" ON public.scenes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_allowed_user(auth.uid()) AND EXISTS (
    SELECT 1 FROM projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update own scenes" ON public.scenes;
CREATE POLICY "Users can update own scenes" ON public.scenes
  FOR UPDATE TO authenticated
  USING (public.is_allowed_user(auth.uid()) AND EXISTS (
    SELECT 1 FROM projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can delete own scenes" ON public.scenes;
CREATE POLICY "Users can delete own scenes" ON public.scenes
  FOR DELETE TO authenticated
  USING (public.is_allowed_user(auth.uid()) AND EXISTS (
    SELECT 1 FROM projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()
  ));

-- 7. Update scene_videos RLS policies
DROP POLICY IF EXISTS "Users can view own scene videos" ON public.scene_videos;
CREATE POLICY "Users can view own scene videos" ON public.scene_videos
  FOR SELECT TO authenticated
  USING (public.is_allowed_user(auth.uid()) AND EXISTS (
    SELECT 1 FROM scenes JOIN projects ON projects.id = scenes.project_id
    WHERE scenes.id = scene_videos.scene_id AND projects.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can create own scene videos" ON public.scene_videos;
CREATE POLICY "Users can create own scene videos" ON public.scene_videos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_allowed_user(auth.uid()) AND EXISTS (
    SELECT 1 FROM scenes JOIN projects ON projects.id = scenes.project_id
    WHERE scenes.id = scene_videos.scene_id AND projects.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can delete own scene videos" ON public.scene_videos;
CREATE POLICY "Users can delete own scene videos" ON public.scene_videos
  FOR DELETE TO authenticated
  USING (public.is_allowed_user(auth.uid()) AND EXISTS (
    SELECT 1 FROM scenes JOIN projects ON projects.id = scenes.project_id
    WHERE scenes.id = scene_videos.scene_id AND projects.user_id = auth.uid()
  ));
