begin;
-- Disable the old privilege-granting RPC even for clients with stale JS.
create or replace function public.activate_teacher_profile() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin raise exception 'Administrator approval is required. Submit a teacher application.'; end; $$;
revoke all on function public.activate_teacher_profile() from public,anon,authenticated;
alter table public.teacher_profiles drop constraint if exists teacher_profiles_status_check;
alter table public.teacher_profiles add constraint teacher_profiles_status_check
 check(status in ('approved','pending_review','suspended','revoked'));
update public.teacher_profiles p set status='pending_review',updated_at=now()
where p.status='approved' and p.approved_by is null and not exists (
 select 1 from public.teacher_applications a where a.id=p.application_id
 and a.status='approved' and a.reviewer_id is not null
);
update public.teacher_profiles p set approved_by=a.reviewer_id
from public.teacher_applications a where p.application_id=a.id and p.status='approved'
 and p.approved_by is null and a.status='approved' and a.reviewer_id is not null;
insert into public.teacher_applications(user_id,institution_name,evidence_notes,status)
 select p.user_id,'Existing instructor','Administrator review required for a previously self-activated teacher profile.','pending_review'
 from public.teacher_profiles p where p.status='pending_review' and not exists (
 select 1 from public.teacher_applications a where a.user_id=p.user_id and a.status in ('pending_review','info_requested'));
create or replace function public.is_verified_teacher(target_user_id uuid default null)
returns boolean language sql security definer stable set search_path=public,pg_temp as $$
 select exists(select 1 from public.teacher_profiles where user_id=coalesce(target_user_id,auth.uid())
 and status='approved' and approved_by is not null);
$$;
-- Harden existing owner-based RLS branches while retaining their member/admin branches.
do $$ declare p record; q text; c text; begin
 for p in select schemaname,tablename,policyname,qual,with_check from pg_policies
 where schemaname='public' and (coalesce(qual,'')||coalesce(with_check,'')) ~ 'teacher_id' loop
 q:=regexp_replace(p.qual,'((\w+\.)?teacher_id = auth.uid\(\))','(\1 AND public.is_verified_teacher(auth.uid()))','g');
 c:=regexp_replace(p.with_check,'((\w+\.)?teacher_id = auth.uid\(\))','(\1 AND public.is_verified_teacher(auth.uid()))','g');
 execute format('alter policy %I on %I.%I %s %s',p.policyname,p.schemaname,p.tablename,
 case when q is not null then 'using ('||q||')' else '' end,
 case when c is not null then 'with check ('||c||')' else '' end);
 end loop;
end $$;
commit;
