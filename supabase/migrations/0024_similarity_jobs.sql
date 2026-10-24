begin;
create table public.similarity_jobs(
 id uuid primary key default gen_random_uuid(),teacher_id uuid not null references public.profiles(id) on delete cascade,
 assignment_id uuid not null references public.classroom_assignments(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','running','complete','failed')),
 progress integer not null default 0,result jsonb,error text,created_at timestamptz not null default now(),locked_at timestamptz,finished_at timestamptz
);
create unique index similarity_active_assignment on public.similarity_jobs(assignment_id) where state in ('pending','running');
alter table public.similarity_jobs enable row level security;
create policy similarity_teacher_read on public.similarity_jobs for select to authenticated using((teacher_id=auth.uid() and public.is_verified_teacher()) or public.is_admin());
grant select on public.similarity_jobs to authenticated;grant all on public.similarity_jobs to service_role;
create table public.similarity_fingerprints(cache_key text primary key,value jsonb not null,created_at timestamptz not null default now());
alter table public.similarity_fingerprints enable row level security;grant all on public.similarity_fingerprints to service_role;
create table public.similarity_comparisons(cache_key text primary key,value jsonb not null,created_at timestamptz not null default now());
alter table public.similarity_comparisons enable row level security;grant all on public.similarity_comparisons to service_role;
create or replace function public.claim_similarity_job() returns setof public.similarity_jobs
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not pg_try_advisory_xact_lock(hashtext('outputtracer_similarity_worker')) then return; end if;
 if exists(select 1 from public.similarity_jobs where state='running' and locked_at>now()-interval '3 minutes') then return; end if;
 return query update public.similarity_jobs set state='running',locked_at=now() where id=(
 select id from public.similarity_jobs where state='pending' or(state='running' and locked_at<now()-interval '3 minutes') order by created_at limit 1 for update skip locked) returning *;
end $$;
revoke all on function public.claim_similarity_job() from public,anon,authenticated;grant execute on function public.claim_similarity_job() to service_role;
commit;
