
-- 0. Ensure bot has a row in auth.users so FKs to auth.users work
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-0000000000b0',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated',
  '[email protected]',
  crypt(gen_random_uuid()::text, gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"system","providers":["system"]}'::jsonb,
  '{"display_name":"Hoàng Thiên AI"}'::jsonb,
  false, false, false
)
ON CONFLICT (id) DO NOTHING;

-- Make sure bot's profile exists & is flagged
INSERT INTO public.profiles (id, display_name, is_bot, is_verified)
VALUES ('00000000-0000-0000-0000-0000000000b0','Hoàng Thiên AI', true, true)
ON CONFLICT (id) DO UPDATE SET is_bot = true, is_verified = true;

-- 1. Add username / phone to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS phone text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (lower(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
  ON public.profiles (phone) WHERE phone IS NOT NULL;

-- 2. Pin flag on conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

-- 3. AI memory tables
CREATE TABLE IF NOT EXISTS public.ai_conversation_memory (
  conversation_id uuid PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  summary text NOT NULL DEFAULT '',
  last_summarized_msg_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_conversation_memory TO authenticated;
GRANT ALL ON public.ai_conversation_memory TO service_role;
ALTER TABLE public.ai_conversation_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read ai conv memory" ON public.ai_conversation_memory;
CREATE POLICY "members read ai conv memory"
  ON public.ai_conversation_memory FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.ai_user_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fact text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_user_memory_user_idx ON public.ai_user_memory(user_id, created_at DESC);
GRANT SELECT, DELETE ON public.ai_user_memory TO authenticated;
GRANT ALL ON public.ai_user_memory TO service_role;
ALTER TABLE public.ai_user_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own ai memory" ON public.ai_user_memory;
CREATE POLICY "users read own ai memory"
  ON public.ai_user_memory FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "users delete own ai memory" ON public.ai_user_memory;
CREATE POLICY "users delete own ai memory"
  ON public.ai_user_memory FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 4. Update handle_new_user to read username & phone from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  _username text;
  _phone text;
begin
  _username := nullif(trim(new.raw_user_meta_data->>'username'), '');
  _phone := nullif(trim(new.raw_user_meta_data->>'phone'), '');

  insert into public.profiles (id, display_name, avatar_url, username, phone)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email,''), '@', 1),
      'Người dùng mới'
    ),
    new.raw_user_meta_data->>'avatar_url',
    _username,
    _phone
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 5. Ensure AI conversation function + trigger
CREATE OR REPLACE FUNCTION public.ensure_ai_conversation(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  _bot uuid := '00000000-0000-0000-0000-0000000000b0';
  _conv uuid;
begin
  if _user_id = _bot then return null; end if;

  select cp1.conversation_id into _conv
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp1.conversation_id = cp2.conversation_id
  join public.conversations c on c.id = cp1.conversation_id
  where cp1.user_id = _user_id and cp2.user_id = _bot and c.is_group = false
  limit 1;

  if _conv is not null then
    update public.conversations set is_pinned = true where id = _conv;
    return _conv;
  end if;

  insert into public.conversations (is_group, created_by, is_pinned, last_message_at)
  values (false, _user_id, true, now())
  returning id into _conv;

  insert into public.conversation_participants (conversation_id, user_id) values
    (_conv, _user_id),
    (_conv, _bot);

  insert into public.messages (conversation_id, sender_id, content, kind)
  values (_conv, _bot,
    'Xin chào! Mình là Hoàng Thiên AI 👋. Hỏi mình bất cứ điều gì nhé — mình luôn ở đây 24/7.',
    'text');

  return _conv;
end;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_profile_ai_conv()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if coalesce(new.is_bot,false) then return new; end if;
  perform public.ensure_ai_conversation(new.id);
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_profile_ai_conv ON public.profiles;
CREATE TRIGGER trg_profile_ai_conv
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile_ai_conv();

-- 6. Backfill AI conversation for existing users
DO $$
declare r record;
begin
  for r in select id from public.profiles where coalesce(is_bot,false) = false loop
    perform public.ensure_ai_conversation(r.id);
  end loop;
end$$;
