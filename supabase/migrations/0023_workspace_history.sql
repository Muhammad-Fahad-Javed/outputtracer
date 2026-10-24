begin;
create table public.workspace_history(
 user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('project','assignment')),target_id uuid not null,
 last_opened_at timestamptz not null default now(),primary key(user_id,kind,target_id)
);
alter table public.workspace_history enable row level security;
create policy history_owner on public.workspace_history for select to authenticated using(user_id=auth.uid());
grant select on public.workspace_history to authenticated;grant all on public.workspace_history to service_role;
create index history_recent on public.workspace_history(user_id,last_opened_at desc);
commit;
