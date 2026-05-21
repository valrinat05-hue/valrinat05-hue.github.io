
-- Profiles table linked to auth.users
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'edited',
  genre TEXT,
  duration_minutes INT,
  scenes_count INT NOT NULL DEFAULT 1,
  script TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Scenes table
CREATE TABLE public.scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  scene_number INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scenes" ON public.scenes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can create own scenes" ON public.scenes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can update own scenes" ON public.scenes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can delete own scenes" ON public.scenes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()));

-- Scene videos table
CREATE TABLE public.scene_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID REFERENCES public.scenes(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  angle_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scene_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scene videos" ON public.scene_videos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.scenes 
    JOIN public.projects ON projects.id = scenes.project_id 
    WHERE scenes.id = scene_videos.scene_id AND projects.user_id = auth.uid()
  ));
CREATE POLICY "Users can create own scene videos" ON public.scene_videos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.scenes 
    JOIN public.projects ON projects.id = scenes.project_id 
    WHERE scenes.id = scene_videos.scene_id AND projects.user_id = auth.uid()
  ));
CREATE POLICY "Users can delete own scene videos" ON public.scene_videos FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.scenes 
    JOIN public.projects ON projects.id = scenes.project_id 
    WHERE scenes.id = scene_videos.scene_id AND projects.user_id = auth.uid()
  ));
