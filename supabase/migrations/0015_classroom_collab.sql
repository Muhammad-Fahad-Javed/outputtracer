-- Shared classroom documents, an explicit assignment lock, and compiler policy.
-- Service role writes documents and policy. Students do not write these tables
-- directly. This migration has not been applied to production by this change.

alter table public.classroom_assignments
  add column if not exists locked boolean not null default false,
  add column if not exists allow_run boolean not null default true,
  add column if not exists allow_trace boolean not null default false,
  add column if not exists time_limit_ms integer not null default 10000;

alter table public.classroom_assignments
  drop constraint if exists classroom_assignments_time_limit_ms_check;

alter table public.classroom_assignments
  add constraint classroom_assignments_time_limit_ms_check
  check (time_limit_ms >= 1000 and time_limit_ms <= 10000);

create table if not exists public.classroom_documents (
  doc_key text primary key,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  assignment_id uuid not null references public.classroom_assignments(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  group_id uuid references public.classroom_groups(id) on delete cascade,
  state_b64 text not null,
  files jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint classroom_documents_owner check (
    (student_id is not null and group_id is null) or
    (student_id is null and group_id is not null)
  )
);

create index if not exists idx_classroom_documents_assignment
  on public.classroom_documents(assignment_id);

alter table public.classroom_documents enable row level security;

drop policy if exists "Teachers can view classroom documents" on public.classroom_documents;
create policy "Teachers can view classroom documents"
  on public.classroom_documents for select
  using (
    public.is_admin() or
    exists (
      select 1 from public.classrooms c
      where c.id = classroom_documents.classroom_id and c.teacher_id = auth.uid()
    )
  );
