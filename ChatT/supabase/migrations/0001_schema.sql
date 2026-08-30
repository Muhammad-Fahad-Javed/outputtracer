-- ============================================================================
-- 0001_schema.sql
-- Core schema for the multi-tenant couples chat application.
-- ============================================================================

-- Required for gen_random_uuid()
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- profiles: one row per auth.users account.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null default 'User',
  avatar_url text,
  last_seen timestamptz not null default now(),
  is_online boolean not null default false,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user is created via Supabase Auth.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- connection_codes: codes used by users to pair up
-- ----------------------------------------------------------------------------
create table if not exists public.connection_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  used boolean not null default false
);

-- ----------------------------------------------------------------------------
-- conversations: one conversation per couple.
-- ----------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_1_id uuid not null references public.profiles (id) on delete cascade,
  user_2_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint different_users check (user_1_id <> user_2_id)
);

create unique index if not exists idx_conversations_pair
  on public.conversations (least(user_1_id, user_2_id), greatest(user_1_id, user_2_id));

-- ----------------------------------------------------------------------------
-- messages
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  message_text text,
  message_type text not null default 'text' check (message_type in ('text', 'image')),
  attachment_path text, -- storage object path, not a public URL
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  constraint text_or_attachment check (
    (message_type = 'text' and message_text is not null and length(trim(message_text)) > 0)
    or (message_type = 'image' and attachment_path is not null)
  )
);

create index if not exists idx_messages_conversation_created
  on public.messages (conversation_id, created_at desc);

-- ----------------------------------------------------------------------------
-- saved_photos: per-user "Saved Photos / Memories" bookmarks
-- ----------------------------------------------------------------------------
create table if not exists public.saved_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);

-- ----------------------------------------------------------------------------
-- Presence heartbeat helper
-- ----------------------------------------------------------------------------
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set last_seen = now()
  where id = auth.uid();
$$;

create or replace function public.set_online_status(online boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set is_online = online,
      last_seen = case when online = false then now() else last_seen end
  where id = auth.uid();
$$;
