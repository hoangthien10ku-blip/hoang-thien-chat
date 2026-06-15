
-- ============== PROFILES ==============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text not null default 'Người dùng mới',
  avatar_url text,
  bio text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create policy "profiles_select_all_auth" on public.profiles
  for select to authenticated using (true);
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update_self" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email,''), '@', 1),
      'Người dùng mới'
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at helper
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ============== FRIENDSHIPS ==============
create type public.friendship_status as enum ('pending','accepted');

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendship_distinct check (requester_id <> addressee_id),
  constraint friendship_unique unique (requester_id, addressee_id)
);
create index on public.friendships (addressee_id);
create index on public.friendships (requester_id);

grant select, insert, update, delete on public.friendships to authenticated;
grant all on public.friendships to service_role;
alter table public.friendships enable row level security;

create policy "friendships_select_involved" on public.friendships
  for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "friendships_insert_self" on public.friendships
  for insert to authenticated
  with check (auth.uid() = requester_id);

create policy "friendships_update_addressee_or_either_on_accept" on public.friendships
  for update to authenticated
  using (auth.uid() = addressee_id or auth.uid() = requester_id);

create policy "friendships_delete_involved" on public.friendships
  for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create trigger friendships_touch_updated_at
  before update on public.friendships
  for each row execute function public.touch_updated_at();

-- ============== CONVERSATIONS ==============
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  title text,
  avatar_url text,
  created_by uuid references auth.users(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select, insert, update on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index on public.conversation_participants (user_id);

grant select, insert, update, delete on public.conversation_participants to authenticated;
grant all on public.conversation_participants to service_role;
alter table public.conversation_participants enable row level security;

-- Security definer helper to avoid recursive RLS
create or replace function public.is_conversation_member(_conv uuid, _user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.conversation_participants
    where conversation_id = _conv and user_id = _user
  );
$$;

create policy "conversations_select_member" on public.conversations
  for select to authenticated
  using (public.is_conversation_member(id, auth.uid()));

create policy "conversations_insert_creator" on public.conversations
  for insert to authenticated
  with check (auth.uid() = created_by);

create policy "conversations_update_member" on public.conversations
  for update to authenticated
  using (public.is_conversation_member(id, auth.uid()));

create policy "cp_select_self_or_member" on public.conversation_participants
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_conversation_member(conversation_id, auth.uid())
  );

create policy "cp_insert_self_or_creator" on public.conversation_participants
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
    or public.is_conversation_member(conversation_id, auth.uid())
  );

create policy "cp_update_self" on public.conversation_participants
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "cp_delete_self_or_member" on public.conversation_participants
  for delete to authenticated
  using (user_id = auth.uid() or public.is_conversation_member(conversation_id, auth.uid()));

-- ============== MESSAGES ==============
create type public.message_kind as enum ('text','image','video','file','system');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text,
  kind public.message_kind not null default 'text',
  attachment_url text,
  attachment_name text,
  attachment_size integer,
  recalled boolean not null default false,
  deleted_for uuid[] not null default '{}',
  reply_to uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at desc);
create index on public.messages (sender_id);

grant select, insert, update, delete on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;

create policy "messages_select_member" on public.messages
  for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

create policy "messages_insert_member" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id, auth.uid())
  );

create policy "messages_update_sender" on public.messages
  for update to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

create policy "messages_delete_sender" on public.messages
  for delete to authenticated
  using (sender_id = auth.uid());

-- Bump conversation last_message_at on new message
create or replace function public.bump_conversation_last_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
    set last_message_at = new.created_at
    where id = new.conversation_id;
  return new;
end;
$$;
create trigger messages_bump_conv
  after insert on public.messages
  for each row execute function public.bump_conversation_last_message();

-- ============== REALTIME ==============
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.conversation_participants;
alter publication supabase_realtime add table public.friendships;
alter publication supabase_realtime add table public.profiles;
