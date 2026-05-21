INSERT INTO public.user_allowlist (user_id, email)
SELECT id, email FROM auth.users WHERE lower(email) = 'valkaa767@gmail.com'
ON CONFLICT DO NOTHING;