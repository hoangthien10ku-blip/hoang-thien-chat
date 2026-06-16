
-- Grant admin role to the owner account (Google sign-in didn't trigger the bootstrap)
INSERT INTO public.user_roles (user_id, role)
VALUES ('3b9ac2ec-bb99-47bc-92b2-eb226875abfc', 'admin')
ON CONFLICT DO NOTHING;

-- Verified badge + bot flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;

-- Allow profiles for non-auth virtual users (the AI bot)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Insert the AI bot profile
INSERT INTO public.profiles (id, display_name, avatar_url, is_verified, is_bot)
VALUES (
  '00000000-0000-0000-0000-0000000000b0',
  'Hoàng Thiên AI',
  null,
  true,
  true
)
ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      is_verified = true,
      is_bot = true;

-- Mark the owner account as verified
UPDATE public.profiles
  SET is_verified = true
  WHERE id = '3b9ac2ec-bb99-47bc-92b2-eb226875abfc';

-- Helper to mark admins verified automatically going forward
CREATE OR REPLACE FUNCTION public.sync_admin_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'admin' THEN
    UPDATE public.profiles SET is_verified = true WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_admin_verified ON public.user_roles;
CREATE TRIGGER trg_sync_admin_verified
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.sync_admin_verified();
