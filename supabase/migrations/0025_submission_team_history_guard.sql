begin;
-- Preserve frozen ownership after a student leaves the roster. Teachers must
-- still be able to grade existing hand-ins; the API checks current instructor
-- approval/ownership before writing. Reject groups from another assignment/class.
create or replace function public.validate_assignment_submission_team() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.classroom_assignments; g public.classroom_groups; begin
 select * into a from public.classroom_assignments where id=new.assignment_id;
 if new.group_id is not null then
  select * into g from public.classroom_groups where id=new.group_id for update;
  if g.classroom_id is distinct from a.classroom_id then raise exception 'Submission team belongs to another classroom'; end if;
 end if;
 if a.group_scope='assignment' then
  if a.group_mode then
   if g.assignment_id is distinct from a.id or (select count(*) from public.classroom_group_members where group_id=g.id)<>a.required_group_size then raise exception 'A complete team for this assignment is required'; end if;
   if g.membership_frozen_at is null and (select count(*) from public.classroom_group_members gm join public.classroom_members cm on cm.classroom_id=a.classroom_id and cm.user_id=gm.user_id and cm.role='student' where gm.group_id=g.id)<>a.required_group_size then raise exception 'Team students must be enrolled before the first submission'; end if;
   if new.status<>'draft' then update public.classroom_groups set membership_frozen_at=coalesce(membership_frozen_at,now()) where id=g.id; end if;
  elsif new.group_id is not null or new.student_id is null then
   raise exception 'Individual assignments require an individual submission';
  end if;
 end if;
 return new;
end $$;
commit;
