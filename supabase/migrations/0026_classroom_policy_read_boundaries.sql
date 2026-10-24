begin;
-- Roster policies previously selected their own protected table and classrooms
-- selected the roster back, producing RLS recursion. These narrowly scoped
-- helpers inspect only the current authenticated actor and bypass that cycle.
create or replace function public.classroom_actor_is_owner(cid uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.classrooms c where c.id=cid
 and c.teacher_id=auth.uid() and public.is_verified_teacher(auth.uid()));
$$;
create or replace function public.classroom_actor_is_member(cid uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.classroom_members m join public.classrooms c on c.id=m.classroom_id
 where m.classroom_id=cid and m.user_id=auth.uid() and c.teacher_id<>auth.uid()
 and m.role in ('student','assistant'));
$$;
revoke all on function public.classroom_actor_is_owner(uuid),public.classroom_actor_is_member(uuid) from public,anon;
grant execute on function public.classroom_actor_is_owner(uuid),public.classroom_actor_is_member(uuid) to authenticated,service_role;

alter policy "Members and admins can view classrooms" on public.classrooms
 using (public.is_admin() or public.classroom_actor_is_owner(id) or public.classroom_actor_is_member(id));
alter policy "Classroom owner can update classroom" on public.classrooms
 using (public.is_admin() or (teacher_id=auth.uid() and public.is_verified_teacher()))
 with check (public.is_admin() or (teacher_id=auth.uid() and public.is_verified_teacher()));
alter policy "Classroom members can view roster" on public.classroom_members
 using (public.is_admin() or public.classroom_actor_is_owner(classroom_id) or public.classroom_actor_is_member(classroom_id));
alter policy "Teachers can manage classroom members" on public.classroom_members
 using (public.is_admin() or public.classroom_actor_is_owner(classroom_id))
 with check (public.is_admin() or public.classroom_actor_is_owner(classroom_id));

-- Earlier approval hardening matched teacher_id=auth.uid(), but a few historical
-- policies used the reversed equality (including private teacher feedback).
do $$ declare p record; q text; c text; begin
 for p in select schemaname,tablename,policyname,qual,with_check from pg_policies
 where schemaname='public' and (coalesce(qual,'')||coalesce(with_check,'')) ~ 'auth.uid\(\) = (\w+\.)?teacher_id' loop
 q:=regexp_replace(p.qual,'(auth.uid\(\) = (\w+\.)?teacher_id)','(\1 AND public.is_verified_teacher(auth.uid()))','g');
 c:=regexp_replace(p.with_check,'(auth.uid\(\) = (\w+\.)?teacher_id)','(\1 AND public.is_verified_teacher(auth.uid()))','g');
 execute format('alter policy %I on %I.%I %s %s',p.policyname,p.schemaname,p.tablename,
 case when q is not null then 'using ('||q||')' else '' end,
 case when c is not null then 'with check ('||c||')' else '' end);
 end loop;
end $$;

-- Reassert the hidden-test column boundary even on databases whose old blanket
-- table grants were reapplied. Server-side grading retains service-role access.
revoke select on public.classroom_assignments from public,anon,authenticated;
revoke select(hidden_test_cases) on public.classroom_assignments from public,anon,authenticated;
do $$ declare cols text; begin
 select string_agg(quote_ident(column_name),', ' order by ordinal_position) into cols
 from information_schema.columns where table_schema='public' and table_name='classroom_assignments'
 and column_name<>'hidden_test_cases';
 execute 'grant select ('||cols||') on public.classroom_assignments to authenticated';
end $$;
commit;
