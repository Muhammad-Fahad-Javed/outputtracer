-- ==============================================================================
-- OutputTracer: Migration 0011 — Shared User Profiles, Roles & Avatar Storage
-- (0011_user_profiles_and_roles_system.sql)
-- ==============================================================================

-- 1. EXTEND PUBLIC.PROFILES TABLE
-- Supports rich user profiles across Learners, Teachers, and Administrators.
alter table public.profiles
  add column if not exists full_name text not null default '',
  add column if not exists username text,
  add column if not exists avatar_url text,
  add column if not exists phone text not null default '',
  add column if not exists bio text not null default '',
  add column if not exists country text not null default '',
  add column if not exists city text not null default '',
  add column if not exists preferred_languages text[] not null default array['cpp']::text[],
  add column if not exists updated_at timestamptz not null default now();

-- Unique username constraint (case-insensitive, non-null)
create unique index if not exists idx_profiles_username_lower
  on public.profiles (lower(trim(username)))
  where username is not null and trim(username) <> '';

-- Ensure updated_at triggers or updates cleanly
create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

-- 2. EXTEND APP_ROLES TABLE CHECK CONSTRAINT
-- Ensure app_roles can safely accommodate ('admin', 'staff', 'student', 'teacher')
do $$
begin
  alter table public.app_roles drop constraint if exists app_roles_role_check;
  alter table public.app_roles add constraint app_roles_role_check
    check (role in ('admin', 'staff', 'student', 'teacher'));
exception
  when undefined_table then null;
  when others then null;
end $$;

-- 3. RLS POLICIES FOR PUBLIC.PROFILES
alter table public.profiles enable row level security;

-- Authenticated users can view all profiles (needed for classrooms, chat, assignments, teacher directory)
drop policy if exists "Authenticated users can view profiles" on public.profiles;
create policy "Authenticated users can view profiles"
  on public.profiles for select
  using (auth.uid() is not null);

-- Users can only update their own profile
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 4. STORAGE BUCKET FOR USER AVATARS (Idempotent)
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
exception
  when others then null;
end $$;

-- Avatar storage RLS policies
do $$
begin
  -- Public avatar read
  drop policy if exists "Public avatar access" on storage.objects;
  create policy "Public avatar access"
    on storage.objects for select
    using (bucket_id = 'avatars');

  -- User avatar uploads: files must be in user's own folder (user_id/filename)
  drop policy if exists "Users can upload own avatar" on storage.objects;
  create policy "Users can upload own avatar"
    on storage.objects for insert
    with check (
      bucket_id = 'avatars'
      and auth.uid()::text = (storage.foldername(name))[1]
    );

  -- User avatar updates
  drop policy if exists "Users can update own avatar" on storage.objects;
  create policy "Users can update own avatar"
    on storage.objects for update
    using (
      bucket_id = 'avatars'
      and auth.uid()::text = (storage.foldername(name))[1]
    );

  -- User avatar deletes
  drop policy if exists "Users can delete own avatar" on storage.objects;
  create policy "Users can delete own avatar"
    on storage.objects for delete
    using (
      bucket_id = 'avatars'
      and auth.uid()::text = (storage.foldername(name))[1]
    );
exception
  when others then null;
end $$;
