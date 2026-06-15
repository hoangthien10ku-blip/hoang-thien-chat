
-- Fix touch_updated_at search_path
create or replace function public.touch_updated_at()
returns trigger language plpgsql
security invoker
set search_path = public
as $$
begin new.updated_at = now(); return new; end;
$$;

-- Lock down SECURITY DEFINER functions
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.bump_conversation_last_message() from public, anon, authenticated;
revoke all on function public.is_conversation_member(uuid, uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated, service_role;
