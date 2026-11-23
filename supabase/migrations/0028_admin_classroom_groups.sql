begin;

-- Only the application service may call these functions. It resolves the
-- signed-in actor and verifies server-configured admins before passing true.
-- The actor is never replaced with the classroom owner.
create function public.create_assignment_team(
  actor uuid, aid uuid, team_name text, student_ids uuid[],
  existing_group uuid, verified_server_admin boolean
) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  a public.classroom_assignments;
  owner_id uuid;
  gid uuid;
  actor_is_admin boolean;
  selected_count integer := coalesce(cardinality(student_ids), 0);
begin
  select * into a from public.classroom_assignments where id=aid for update;
  if not found or not a.group_mode or a.group_scope<>'assignment' then
    raise exception 'Assignment teams are unavailable';
  end if;
  select teacher_id into owner_id from public.classrooms where id=a.classroom_id;
  actor_is_admin := coalesce(verified_server_admin, false) or exists(
    select 1 from public.app_roles where user_id=actor and role='admin'
  );
  if actor is null or not (actor_is_admin or (owner_id=actor and public.is_verified_teacher(actor))) then
    raise exception 'Teacher privileges required';
  end if;
  if team_name is null or length(trim(team_name)) not between 1 and 80 then
    raise exception 'Team name must be 1–80 characters';
  end if;
  if selected_count not between 2 and a.required_group_size or
     (select count(distinct x) from unnest(student_ids) x)<>selected_count then
    raise exception 'Select between 2 and % distinct students', a.required_group_size;
  end if;
  if (select count(*) from public.classroom_members
      where classroom_id=a.classroom_id and role='student' and user_id=any(student_ids))<>selected_count then
    raise exception 'All students must be enrolled in this classroom';
  end if;
  if existing_group is null then
    insert into public.classroom_groups(classroom_id,assignment_id,name)
      values(a.classroom_id,aid,trim(team_name)) returning id into gid;
  else
    select id into gid from public.classroom_groups where id=existing_group and assignment_id=aid for update;
    if gid is null then raise exception 'Team does not belong to this assignment'; end if;
    if exists(select 1 from public.classroom_groups where id=gid and membership_frozen_at is not null) then
      raise exception 'Team membership is frozen after the first submission';
    end if;
    delete from public.classroom_group_members where group_id=gid;
    update public.classroom_groups set name=trim(team_name) where id=gid;
  end if;
  insert into public.classroom_group_members(group_id,user_id,assignment_id)
    select gid,x,aid from unnest(student_ids) x;
  if actor_is_admin then
    insert into public.classroom_audit_logs(actor_id, action, target_type, target_id, details)
      values(actor,
        case when existing_group is null then 'admin_assignment_team_created' else 'admin_assignment_team_updated' end,
        'classroom_assignment', aid::text, jsonb_build_object('groupId', gid, 'classroomId', a.classroom_id));
  end if;
  return gid;
end $$;

-- Preserve the existing service contract for older application releases.
create or replace function public.create_assignment_team(
  actor uuid, aid uuid, team_name text, student_ids uuid[], existing_group uuid default null
) returns uuid
language sql security definer set search_path=public,pg_temp as $$
  select public.create_assignment_team(actor, aid, team_name, student_ids, existing_group, false);
$$;

create function public.create_classroom_group_as_admin(actor uuid, cid uuid, group_name text, verified_server_admin boolean)
returns public.classroom_groups
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  created_group public.classroom_groups;
begin
  if actor is null or not (coalesce(verified_server_admin, false) or exists(
    select 1 from public.app_roles where user_id=actor and role='admin'
  )) then raise exception 'Administrator privileges required'; end if;
  if group_name is null or length(trim(group_name)) not between 1 and 80 then
    raise exception 'Group name must be 1–80 characters';
  end if;
  insert into public.classroom_groups(classroom_id,name)
    values(cid,trim(group_name)) returning * into created_group;
  insert into public.classroom_audit_logs(actor_id, action, target_type, target_id, details)
    values(actor, 'admin_classroom_group_created', 'classroom', cid::text,
      jsonb_build_object('groupId', created_group.id));
  return created_group;
end $$;

revoke all on function public.create_assignment_team(uuid,uuid,text,uuid[],uuid,boolean),
  public.create_assignment_team(uuid,uuid,text,uuid[],uuid),
  public.create_classroom_group_as_admin(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.create_assignment_team(uuid,uuid,text,uuid[],uuid,boolean),
  public.create_assignment_team(uuid,uuid,text,uuid[],uuid),
  public.create_classroom_group_as_admin(uuid,uuid,text,boolean) to service_role;

-- required_group_size now represents the maximum. Preserve submitted teams
-- when their roster later changes and validate active enrollment on first hand-in.
create or replace function public.validate_assignment_submission_team() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  a public.classroom_assignments;
  g public.classroom_groups;
  team_size integer;
begin
  select * into a from public.classroom_assignments where id=new.assignment_id;
  if new.group_id is not null then
    select * into g from public.classroom_groups where id=new.group_id for update;
    if g.classroom_id is distinct from a.classroom_id then
      raise exception 'Submission team belongs to another classroom';
    end if;
  end if;
  if a.group_scope='assignment' then
    if a.group_mode then
      if g.assignment_id is distinct from a.id then
        raise exception 'A team for this assignment is required';
      end if;
      if g.membership_frozen_at is null then
        select count(*) into team_size from public.classroom_group_members where group_id=g.id;
        if team_size not between 2 and a.required_group_size then
          raise exception 'The team must have between 2 and % students', a.required_group_size;
        end if;
        if exists(
          select 1 from public.classroom_group_members gm where gm.group_id=g.id
          and not exists (
            select 1 from public.classroom_members cm
            where cm.classroom_id=a.classroom_id and cm.user_id=gm.user_id and cm.role='student'
          )
        ) then raise exception 'Team students must be enrolled before the first submission'; end if;
      end if;
      if new.status<>'draft' then
        update public.classroom_groups set membership_frozen_at=coalesce(membership_frozen_at,now()) where id=g.id;
      end if;
    elsif new.group_id is not null or new.student_id is null then
      raise exception 'Individual assignments require an individual submission';
    end if;
  end if;
  return new;
end $$;

commit;
