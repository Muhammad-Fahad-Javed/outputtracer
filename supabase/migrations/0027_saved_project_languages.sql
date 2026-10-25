-- Saved personal and shared workspaces use the same canonical language metadata
-- as assignments. Existing files and documents remain C++ and are not rewritten.
begin;

-- Shared-project group reads previously recursed through group_members_select.
-- Keep the same member-only visibility with a caller-bound definer lookup.
create or replace function public.group_has_current_member(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.group_members where group_id = gid and user_id = auth.uid()
  );
$$;
revoke all on function public.group_has_current_member(uuid) from public, anon;
grant execute on function public.group_has_current_member(uuid) to authenticated, service_role;
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using (public.group_has_current_member(id));
drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members for select to authenticated
  using (public.group_has_current_member(group_id));

alter table public.projects
  add column if not exists language text not null default 'cpp'
    check (language in ('cpp', 'python', 'asm8086'));
alter table public.projects alter column standard drop not null;
alter table public.projects add constraint projects_language_standard_check check (
  (language = 'cpp' and standard is not null and standard in ('c++11','c++14','c++17','c++20','c++23'))
  or (language in ('python','asm8086') and standard is null)
);

create or replace function public.protect_project_language()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.language is distinct from old.language then
    raise exception 'Create a new project to use a different language';
  end if;
  return new;
end;
$$;
create trigger projects_protect_language before update on public.projects
  for each row execute function public.protect_project_language();
revoke all on function public.protect_project_language() from public, anon, authenticated;

-- Explicit fifth parameter prevents ambiguous PostgREST overload matching.
-- The original four-argument function remains a C++ compatibility wrapper.
create function public.create_project(
  p_title text,
  p_standard text,
  p_group uuid,
  p_main text,
  p_language text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pid uuid;
  clean_title text := trim(coalesce(p_title, ''));
  lang text := coalesce(p_language, 'cpp');
  std text;
  entry_file text;
  main_body text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if clean_title = '' then clean_title := 'Untitled'; end if;
  if char_length(clean_title) > 120 then raise exception 'title must be at most 120 characters'; end if;
  if lang not in ('cpp','python','asm8086') then raise exception 'unsupported project language'; end if;
  if lang = 'cpp' then
    std := coalesce(p_standard, 'c++17');
    if std not in ('c++11','c++14','c++17','c++20','c++23') then raise exception 'unsupported C++ standard'; end if;
    entry_file := 'main.cpp';
    main_body := coalesce(p_main, E'#include <iostream>\n\nint main() {\n    // Write your solution here.\n    return 0;\n}\n');
  elsif lang = 'python' then
    entry_file := 'main.py';
    main_body := coalesce(p_main, E'def main():\n    # Write your solution here.\n    pass\n\nif __name__ == ''__main__'':\n    main()\n');
  else
    entry_file := 'main.asm';
    main_body := coalesce(p_main, E'bits 16\norg 100h\n\n; Write your solution here.\n\nmov ax, 4c00h\nint 21h\n');
  end if;
  if octet_length(main_body) > 200000 then raise exception 'starter file is too large'; end if;
  if p_group is not null and not exists (
    select 1 from public.group_members where group_id = p_group and user_id = uid
  ) then raise exception 'you are not a member of that group'; end if;

  insert into public.projects (title, owner_id, group_id, standard, language)
    values (clean_title, uid, p_group, std, lang) returning id into pid;
  insert into public.project_members (project_id, user_id, role) values (pid, uid, 'owner');
  insert into public.project_files (project_id, path, content) values (pid, entry_file, main_body);
  return pid;
end;
$$;
revoke all on function public.create_project(text,text,uuid,text,text) from public, anon;
grant execute on function public.create_project(text,text,uuid,text,text) to authenticated;

create or replace function public.create_project(p_title text,p_standard text,p_group uuid,p_main text)
returns uuid language sql security definer set search_path = public as $$
  select public.create_project(p_title,p_standard,p_group,p_main,'cpp');
$$;
revoke all on function public.create_project(text,text,uuid,text) from public, anon;
grant execute on function public.create_project(text,text,uuid,text) to authenticated;

create or replace function public.set_project_standard(pid uuid, p_standard text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if public.role_rank(public.project_role(pid)) < 2 then raise exception 'you cannot change the language standard'; end if;
  if not exists (select 1 from public.projects where id = pid and language = 'cpp') then
    raise exception 'Only C++ projects have a language standard';
  end if;
  if p_standard is null or p_standard not in ('c++11','c++14','c++17','c++20','c++23') then
    raise exception 'unsupported C++ standard';
  end if;
  update public.projects set standard = p_standard where id = pid;
end;
$$;
revoke all on function public.set_project_standard(uuid,text) from public, anon;
grant execute on function public.set_project_standard(uuid,text) to authenticated;

commit;
