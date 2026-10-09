-- OutputTracer cloud IDE.
-- Run this once in the Supabase SQL editor for a NEW project (not ChatT).
-- It creates accounts, groups, projects, roles, and the snapshot tables
-- the EC2 server uses for live editing.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete set null,
  standard text not null default 'c++17' check (standard in ('c++11', 'c++14', 'c++17', 'c++20', 'c++23')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.project_files (
  project_id uuid not null references public.projects (id) on delete cascade,
  path text not null check (char_length(path) between 1 and 64),
  content text not null default '',
  primary key (project_id, path)
);

create table if not exists public.project_documents (
  project_id uuid primary key references public.projects (id) on delete cascade,
  state_b64 text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  project_id uuid references public.projects (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  role text not null,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (project_id is not null and group_id is null)
    or (project_id is null and group_id is not null)
  )
);

create index if not exists project_members_user_idx on public.project_members (user_id);
create index if not exists group_members_user_idx on public.group_members (user_id);
create index if not exists projects_owner_idx on public.projects (owner_id);
create index if not exists projects_group_idx on public.projects (group_id);
create index if not exists invites_email_idx on public.invites (lower(email));

-- ---------------------------------------------------------------------------
-- Role lookup. security definer so policies can call it without recursing.
-- Group owners are owners of every project in the group.
-- Other group members are editors. A direct project role wins when it is stronger.
-- ---------------------------------------------------------------------------

create or replace function public.role_rank(r text)
returns integer
language sql
immutable
as $$
  select case r
    when 'owner' then 3
    when 'editor' then 2
    when 'viewer' then 1
    else 0
  end;
$$;

create or replace function public.project_role(pid uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  direct text;
  via_group text;
begin
  if uid is null then
    return null;
  end if;

  select role into direct
  from public.project_members
  where project_id = pid and user_id = uid;

  select case when gm.role = 'owner' then 'owner' else 'editor' end
    into via_group
  from public.projects p
  join public.group_members gm
    on gm.group_id = p.group_id and gm.user_id = uid
  where p.id = pid;

  if public.role_rank(direct) >= public.role_rank(via_group) then
    return direct;
  end if;
  return via_group;
end;
$$;

create or replace function public.touch_project_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_project_updated_at();

-- ---------------------------------------------------------------------------
-- New accounts, and invites waiting for that email
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      split_part(coalesce(new.email, 'student'), '@', 1)
    )
  );

  insert into public.project_members (project_id, user_id, role)
  select i.project_id, new.id, i.role
  from public.invites i
  where i.project_id is not null
    and lower(i.email) = lower(coalesce(new.email, ''))
    and i.role in ('editor', 'viewer')
  on conflict (project_id, user_id) do update set role = excluded.role;

  insert into public.group_members (group_id, user_id, role)
  select i.group_id, new.id, 'member'
  from public.invites i
  where i.group_id is not null
    and lower(i.email) = lower(coalesce(new.email, ''))
  on conflict (group_id, user_id) do nothing;

  delete from public.invites
  where lower(email) = lower(coalesce(new.email, ''));

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Mutations. Every function checks auth.uid() itself.
-- ---------------------------------------------------------------------------

create or replace function public.create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  gid uuid;
  clean text := trim(coalesce(p_name, ''));
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if char_length(clean) < 1 or char_length(clean) > 80 then
    raise exception 'group name must be 1-80 characters';
  end if;
  insert into public.groups (name, owner_id) values (clean, uid) returning id into gid;
  insert into public.group_members (group_id, user_id, role) values (gid, uid, 'owner');
  return gid;
end;
$$;

create or replace function public.rename_group(gid uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text := trim(coalesce(p_name, ''));
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = gid and user_id = uid and role = 'owner'
  ) then
    raise exception 'only the group owner can rename it';
  end if;
  if char_length(clean) < 1 or char_length(clean) > 80 then
    raise exception 'group name must be 1-80 characters';
  end if;
  update public.groups set name = clean where id = gid;
end;
$$;

create or replace function public.delete_group(gid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = gid and user_id = uid and role = 'owner'
  ) then
    raise exception 'only the group owner can delete it';
  end if;
  delete from public.groups where id = gid;
end;
$$;

create or replace function public.invite_to_group(gid uuid, target_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  target uuid;
  clean text := lower(trim(coalesce(target_email, '')));
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = gid and user_id = uid and role = 'owner'
  ) then
    raise exception 'only the group owner can invite';
  end if;
  if clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'enter a valid email';
  end if;

  select id into target from public.profiles where lower(email) = clean;
  if target is null then
    delete from public.invites where group_id = gid and lower(email) = clean;
    insert into public.invites (email, group_id, role, invited_by)
    values (clean, gid, 'member', uid);
    return 'pending';
  end if;
  if target = uid then
    raise exception 'you are already in this group';
  end if;
  insert into public.group_members (group_id, user_id, role)
  values (gid, target, 'member')
  on conflict (group_id, user_id) do nothing;
  return 'added';
end;
$$;

create or replace function public.remove_group_member(gid uuid, target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select owner_id into owner from public.groups where id = gid;
  if owner is null then
    raise exception 'group not found';
  end if;
  if target = owner then
    raise exception 'transfer is not available; delete the group or keep the owner';
  end if;
  if uid <> owner and uid <> target then
    raise exception 'not allowed';
  end if;
  delete from public.group_members where group_id = gid and user_id = target;
end;
$$;

create or replace function public.create_project(
  p_title text,
  p_standard text,
  p_group uuid,
  p_main text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pid uuid;
  clean_title text := trim(coalesce(p_title, ''));
  std text := coalesce(p_standard, 'c++17');
  main_body text := coalesce(p_main, '');
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if clean_title = '' then
    clean_title := 'Untitled';
  end if;
  if char_length(clean_title) > 120 then
    raise exception 'title must be at most 120 characters';
  end if;
  if std not in ('c++11', 'c++14', 'c++17', 'c++20', 'c++23') then
    std := 'c++17';
  end if;
  if octet_length(main_body) > 200000 then
    raise exception 'starter file is too large';
  end if;
  if p_group is not null and not exists (
    select 1 from public.group_members where group_id = p_group and user_id = uid
  ) then
    raise exception 'you are not a member of that group';
  end if;

  insert into public.projects (title, owner_id, group_id, standard)
  values (clean_title, uid, p_group, std)
  returning id into pid;

  insert into public.project_members (project_id, user_id, role)
  values (pid, uid, 'owner');

  insert into public.project_files (project_id, path, content)
  values (pid, 'main.cpp', main_body);

  return pid;
end;
$$;

create or replace function public.rename_project(pid uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text := trim(coalesce(p_title, ''));
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if public.role_rank(public.project_role(pid)) < 2 then
    raise exception 'you cannot rename this project';
  end if;
  if char_length(clean) < 1 or char_length(clean) > 120 then
    raise exception 'title must be 1-120 characters';
  end if;
  update public.projects set title = clean where id = pid;
end;
$$;

create or replace function public.set_project_standard(pid uuid, p_standard text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if public.role_rank(public.project_role(pid)) < 2 then
    raise exception 'you cannot change the language standard';
  end if;
  if p_standard not in ('c++11', 'c++14', 'c++17', 'c++20', 'c++23') then
    raise exception 'unsupported standard';
  end if;
  update public.projects set standard = p_standard where id = pid;
end;
$$;

create or replace function public.delete_project(pid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if public.project_role(pid) <> 'owner' then
    raise exception 'only the owner can delete this project';
  end if;
  delete from public.projects where id = pid;
end;
$$;

create or replace function public.invite_to_project(pid uuid, target_email text, target_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  target uuid;
  clean text := lower(trim(coalesce(target_email, '')));
  owner uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if public.project_role(pid) <> 'owner' then
    raise exception 'only the owner can invite';
  end if;
  if target_role not in ('editor', 'viewer') then
    raise exception 'invite someone as an editor or a viewer';
  end if;
  if clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'enter a valid email';
  end if;

  select owner_id into owner from public.projects where id = pid;
  select id into target from public.profiles where lower(email) = clean;

  if target is not null and target = owner then
    raise exception 'that person is already the owner';
  end if;

  if target is null then
    delete from public.invites where project_id = pid and lower(email) = clean;
    insert into public.invites (email, project_id, role, invited_by)
    values (clean, pid, target_role, uid);
    return 'pending';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (pid, target, target_role)
  on conflict (project_id, user_id) do update set role = excluded.role;
  return 'added';
end;
$$;

create or replace function public.set_member_role(pid uuid, target uuid, target_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if public.project_role(pid) <> 'owner' then
    raise exception 'only the owner can change roles';
  end if;
  if target_role not in ('owner', 'editor', 'viewer') then
    raise exception 'invalid role';
  end if;
  if not exists (
    select 1 from public.project_members where project_id = pid and user_id = target
  ) then
    raise exception 'that person is not a direct member';
  end if;

  select owner_id into owner from public.projects where id = pid;

  if target_role = 'owner' then
    update public.project_members
      set role = 'editor'
      where project_id = pid and role = 'owner' and user_id <> target;
    update public.projects set owner_id = target where id = pid;
  elsif target = owner then
    raise exception 'make someone else the owner before changing your role';
  end if;

  update public.project_members
    set role = target_role
    where project_id = pid and user_id = target;
end;
$$;

create or replace function public.remove_project_member(pid uuid, target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select owner_id into owner from public.projects where id = pid;
  if target = owner then
    raise exception 'make someone else the owner before leaving';
  end if;
  if uid <> owner and uid <> target then
    raise exception 'not allowed';
  end if;
  if public.project_role(pid) is null then
    raise exception 'not allowed';
  end if;
  delete from public.project_members where project_id = pid and user_id = target;
end;
$$;

create or replace function public.update_display_name(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text := trim(coalesce(p_name, ''));
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if char_length(clean) < 1 or char_length(clean) > 40 then
    raise exception 'name must be 1-40 characters';
  end if;
  update public.profiles set display_name = clean where id = uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_files enable row level security;
alter table public.project_documents enable row level security;
alter table public.invites enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.project_members mine
      join public.project_members theirs on theirs.project_id = mine.project_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
    or exists (
      select 1
      from public.group_members mine
      join public.group_members theirs on theirs.group_id = mine.group_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid()
    )
  );

drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members
  for select to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = group_members.group_id and gm.user_id = auth.uid()
    )
  );

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (public.project_role(id) is not null);

drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select to authenticated
  using (public.project_role(project_id) is not null);

drop policy if exists project_files_select on public.project_files;
create policy project_files_select on public.project_files
  for select to authenticated
  using (public.project_role(project_id) is not null);

drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select to authenticated
  using (
    (project_id is not null and public.project_role(project_id) = 'owner')
    or (
      group_id is not null and exists (
        select 1 from public.group_members gm
        where gm.group_id = invites.group_id
          and gm.user_id = auth.uid()
          and gm.role = 'owner'
      )
    )
  );

-- Documents are written by the EC2 server with the service role.
-- No authenticated policy: members cannot read or write the Yjs blob directly.

grant usage on schema public to authenticated, service_role;

grant select on public.profiles to authenticated;
grant select on public.groups to authenticated;
grant select on public.group_members to authenticated;
grant select on public.projects to authenticated;
grant select on public.project_members to authenticated;
grant select on public.project_files to authenticated;
grant select on public.invites to authenticated;

grant all on public.profiles to service_role;
grant all on public.groups to service_role;
grant all on public.group_members to service_role;
grant all on public.projects to service_role;
grant all on public.project_members to service_role;
grant all on public.project_files to service_role;
grant all on public.project_documents to service_role;
grant all on public.invites to service_role;

revoke all on public.project_documents from authenticated, anon;
revoke all on function public.role_rank(text) from public;
revoke all on function public.project_role(uuid) from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.create_group(text) from public;
revoke all on function public.rename_group(uuid, text) from public;
revoke all on function public.delete_group(uuid) from public;
revoke all on function public.invite_to_group(uuid, text) from public;
revoke all on function public.remove_group_member(uuid, uuid) from public;
revoke all on function public.create_project(text, text, uuid, text) from public;
revoke all on function public.rename_project(uuid, text) from public;
revoke all on function public.set_project_standard(uuid, text) from public;
revoke all on function public.delete_project(uuid) from public;
revoke all on function public.invite_to_project(uuid, text, text) from public;
revoke all on function public.set_member_role(uuid, uuid, text) from public;
revoke all on function public.remove_project_member(uuid, uuid) from public;
revoke all on function public.update_display_name(text) from public;

grant execute on function public.role_rank(text) to authenticated, service_role;
grant execute on function public.project_role(uuid) to authenticated, service_role;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.rename_group(uuid, text) to authenticated;
grant execute on function public.delete_group(uuid) to authenticated;
grant execute on function public.invite_to_group(uuid, text) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.create_project(text, text, uuid, text) to authenticated;
grant execute on function public.rename_project(uuid, text) to authenticated;
grant execute on function public.set_project_standard(uuid, text) to authenticated;
grant execute on function public.delete_project(uuid) to authenticated;
grant execute on function public.invite_to_project(uuid, text, text) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;
grant execute on function public.update_display_name(text) to authenticated;
