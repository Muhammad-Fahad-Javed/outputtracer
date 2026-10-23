-- Teacher activation is a user choice, not an application approval workflow.
-- Keep legacy 'approved' as the active storage value to preserve existing RLS.
-- Suspended/revoked profiles remain blocked; only administrators can restore them.
begin;
create or replace function public.activate_teacher_profile()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  teacher_status text;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  -- Serialize activation for the same profile and require a registered profile.
  perform 1 from public.profiles where id = actor for update;
  if not found then raise exception 'Profile unavailable'; end if;
  select status into teacher_status from public.teacher_profiles where user_id = actor for update;
  if teacher_status in ('suspended', 'revoked') then
    raise exception 'Teacher access is restricted. Contact an administrator.';
  end if;
  insert into public.teacher_profiles(user_id, status) values (actor, 'approved')
    on conflict (user_id) do nothing;
  insert into public.app_roles(user_id, role) values (actor, 'teacher')
    on conflict (user_id, role) do nothing;
  if teacher_status is null then
    insert into public.classroom_audit_logs(actor_id, action, target_type, target_id, details)
      values (actor, 'teacher_profile_activated', 'user', actor::text, '{"method":"self_service"}'::jsonb);
  end if;
end;
$$;
revoke all on function public.activate_teacher_profile() from public, anon;
grant execute on function public.activate_teacher_profile() to authenticated;
-- Applications are retained for historical review. Pending applicants can activate
-- explicitly; no denied or suspended account is promoted by this migration.
commit;
