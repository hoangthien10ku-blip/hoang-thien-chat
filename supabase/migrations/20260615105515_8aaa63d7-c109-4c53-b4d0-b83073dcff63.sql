
-- 1. app_role enum
do $$ begin
  create type public.app_role as enum ('admin', 'moderator', 'user');
exception when duplicate_object then null; end $$;

-- 2. user_roles
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

-- 3. has_role security definer
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

drop policy if exists "users see own roles" on public.user_roles;
create policy "users see own roles" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins manage roles" on public.user_roles;
create policy "admins manage roles" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 4. profiles.is_blocked
alter table public.profiles add column if not exists is_blocked boolean not null default false;

drop policy if exists "admins view all profiles" on public.profiles;
create policy "admins view all profiles" on public.profiles
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins update all profiles" on public.profiles;
create policy "admins update all profiles" on public.profiles
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 5. admin overrides on messages & conversations
drop policy if exists "admins view all messages" on public.messages;
create policy "admins view all messages" on public.messages
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins update all messages" on public.messages;
create policy "admins update all messages" on public.messages
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins delete all messages" on public.messages;
create policy "admins delete all messages" on public.messages
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins view all conversations" on public.conversations;
create policy "admins view all conversations" on public.conversations
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- 6. reports
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  reason text not null,
  status text not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert on public.reports to authenticated;
grant all on public.reports to service_role;

alter table public.reports enable row level security;

drop policy if exists "users insert own reports" on public.reports;
create policy "users insert own reports" on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists "users see own reports" on public.reports;
create policy "users see own reports" on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins manage reports" on public.reports;
create policy "admins manage reports" on public.reports
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop trigger if exists trg_reports_touch on public.reports;
create trigger trg_reports_touch before update on public.reports
  for each row execute function public.touch_updated_at();

-- 7. auto-grant admin to bootstrap email (if account exists)
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where lower(email) = lower('[email protected]')
on conflict do nothing;

-- 8. ensure future signup with that email becomes admin
create or replace function public.handle_new_user_admin_bootstrap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(coalesce(new.email,'')) = lower('[email protected]') then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin') on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_admin_bootstrap on auth.users;
create trigger on_auth_user_admin_bootstrap
  after insert on auth.users
  for each row execute function public.handle_new_user_admin_bootstrap();
