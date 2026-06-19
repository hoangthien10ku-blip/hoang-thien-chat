-- Make hoangthien10ku@gmail.com the owner
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'::public.app_role FROM auth.users
WHERE lower(email) = lower('hoangthien10ku@gmail.com')
ON CONFLICT DO NOTHING;

-- Update bootstrap trigger to grant 'owner' to that email on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_admin_bootstrap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if lower(coalesce(new.email,'')) = lower('hoangthien10ku@gmail.com') then
    insert into public.user_roles (user_id, role)
    values (new.id, 'owner'::public.app_role) on conflict do nothing;
  end if;
  return new;
end $function$;