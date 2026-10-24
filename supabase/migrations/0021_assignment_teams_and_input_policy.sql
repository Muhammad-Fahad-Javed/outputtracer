begin;
alter table public.classroom_assignments add column if not exists group_scope text not null default 'legacy_class' check(group_scope in ('legacy_class','assignment'));
alter table public.classroom_assignments add column if not exists required_group_size integer not null default 2 check(required_group_size between 2 and 20);
alter table public.classroom_assignments add column if not exists input_policy text not null default 'paste_allowed' check(input_policy in ('typing_only','paste_allowed'));
-- Defaults apply to future inserts only; legacy rows above retain their behavior.
alter table public.classroom_assignments alter column group_scope set default 'assignment';
alter table public.classroom_assignments alter column input_policy set default 'typing_only';
alter table public.classroom_groups add column if not exists assignment_id uuid references public.classroom_assignments(id) on delete cascade;
alter table public.classroom_groups add column if not exists membership_frozen_at timestamptz;
alter table public.classroom_groups add constraint classroom_groups_assignment_key unique(id,assignment_id);
alter table public.classroom_group_members add column if not exists assignment_id uuid;
alter table public.classroom_group_members add constraint group_member_assignment_fk foreign key(group_id,assignment_id) references public.classroom_groups(id,assignment_id) on delete cascade;
create unique index if not exists one_team_per_assignment_student on public.classroom_group_members(assignment_id,user_id) where assignment_id is not null;
create or replace function public.guard_assignment_team_membership() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.classroom_groups; old_assignment uuid; begin
 if tg_op='UPDATE' and old.group_id is distinct from new.group_id then
  select assignment_id into old_assignment from public.classroom_groups where id=old.group_id for update;
  if old_assignment is not null then raise exception 'Assignment members cannot be moved through a direct update'; end if;
 end if;
 select * into g from public.classroom_groups where id=case when tg_op='DELETE' then old.group_id else new.group_id end for update;
 if g.assignment_id is not null then
  if auth.role()<>'service_role' then raise exception 'Use the assignment team operation'; end if;
  if g.membership_frozen_at is not null then raise exception 'Team membership is frozen after the first submission'; end if;
  if tg_op<>'DELETE' then
   new.assignment_id:=g.assignment_id;
   if not exists(select 1 from public.classroom_members where classroom_id=g.classroom_id and user_id=new.user_id and role='student') then raise exception 'Only enrolled students can join a team'; end if;
  end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger guard_assignment_team_membership before insert or update or delete on public.classroom_group_members for each row execute function public.guard_assignment_team_membership();
create or replace function public.create_assignment_team(actor uuid,aid uuid,team_name text,student_ids uuid[],existing_group uuid default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.classroom_assignments; owner_id uuid; gid uuid; begin
 select * into a from public.classroom_assignments where id=aid for update;
 if not found or not a.group_mode or a.group_scope<>'assignment' then raise exception 'Assignment teams are unavailable'; end if;
 select teacher_id into owner_id from public.classrooms where id=a.classroom_id;
 if not ((owner_id=actor and public.is_verified_teacher(actor)) or exists(select 1 from public.app_roles where user_id=actor and role='admin')) then raise exception 'Teacher privileges required'; end if;
 if length(trim(team_name)) not between 1 and 80 then raise exception 'Team name must be 1–80 characters'; end if;
 if cardinality(student_ids)<>a.required_group_size or (select count(distinct x) from unnest(student_ids) x)<>a.required_group_size then raise exception 'Select exactly % distinct students',a.required_group_size; end if;
 if (select count(*) from public.classroom_members where classroom_id=a.classroom_id and role='student' and user_id=any(student_ids))<>a.required_group_size then raise exception 'All students must be enrolled in this classroom'; end if;
 if existing_group is null then
  insert into public.classroom_groups(classroom_id,assignment_id,name) values(a.classroom_id,aid,trim(team_name)) returning id into gid;
 else
  select id into gid from public.classroom_groups where id=existing_group and assignment_id=aid for update;
  if gid is null then raise exception 'Team does not belong to this assignment'; end if;
  if exists(select 1 from public.classroom_groups where id=gid and membership_frozen_at is not null) then raise exception 'Team membership is frozen after the first submission'; end if;
  delete from public.classroom_group_members where group_id=gid;
  update public.classroom_groups set name=trim(team_name) where id=gid;
 end if;
 insert into public.classroom_group_members(group_id,user_id,assignment_id) select gid,x,aid from unnest(student_ids) x;
 return gid;
end $$;
revoke all on function public.create_assignment_team(uuid,uuid,text,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.create_assignment_team(uuid,uuid,text,uuid[],uuid) to service_role;
create or replace function public.guard_team_assignment() returns trigger
language plpgsql set search_path=public,pg_temp as $$ begin
 if tg_op='INSERT' then
  if new.assignment_id is not null and (auth.role()<>'service_role' or not exists(select 1 from public.classroom_assignments where id=new.assignment_id and classroom_id=new.classroom_id)) then raise exception 'Use the assignment team operation'; end if;
  return new;
 end if;
 if old.membership_frozen_at is not null and new.membership_frozen_at is distinct from old.membership_frozen_at then raise exception 'Team membership freeze is permanent'; end if;
 if new.assignment_id is distinct from old.assignment_id or new.classroom_id is distinct from old.classroom_id then raise exception 'A team cannot be moved to another assignment or classroom'; end if;
 return new;
end $$;
create trigger guard_team_assignment before insert or update on public.classroom_groups for each row execute function public.guard_team_assignment();
-- Lock teams against concurrent first submission and membership changes.
create or replace function public.validate_assignment_submission_team() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.classroom_assignments; g public.classroom_groups; begin
 select * into a from public.classroom_assignments where id=new.assignment_id;
 if a.group_mode and a.group_scope='assignment' then
  select * into g from public.classroom_groups where id=new.group_id for update;
  if g.classroom_id is distinct from a.classroom_id or g.assignment_id is distinct from a.id or (select count(*) from public.classroom_group_members gm join public.classroom_members cm on cm.classroom_id=a.classroom_id and cm.user_id=gm.user_id and cm.role='student' where gm.group_id=g.id)<>a.required_group_size then raise exception 'A complete team for this assignment is required'; end if;
  if new.status<>'draft' then update public.classroom_groups set membership_frozen_at=coalesce(membership_frozen_at,now()) where id=g.id; end if;
 end if;
 return new;
end $$;
create trigger validate_assignment_submission_team before insert or update on public.classroom_submissions for each row execute function public.validate_assignment_submission_team();
alter table public.assignment_activity_events drop constraint if exists assignment_activity_events_event_type_check;
alter table public.assignment_activity_events add constraint assignment_activity_events_event_type_check check(event_type in ('save','run','submit','grade','feedback','reopen','paste'));

commit;
