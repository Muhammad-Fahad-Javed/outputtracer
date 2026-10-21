-- ==============================================================================
-- OutputTracer: Phase 3 — Versioning, Execution History, Grading & Rubrics
-- (0006_phase3_versioning_grading.sql)
-- NOT applied to live DB. Awaiting explicit approval.
-- ==============================================================================

-- 1. CODE VERSIONS
-- Every save creates a new immutable version row. Versions are never updated.
create table if not exists public.assignment_code_versions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.classroom_assignments(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  group_id uuid references public.classroom_groups(id) on delete cascade,
  version_number integer not null,
  code_files jsonb not null default '{}'::jsonb,
  -- SHA-256 hex digest of the canonical JSON of code_files for tamper detection
  content_hash text not null,
  language text not null default 'cpp',
  created_at timestamptz not null default now(),
  constraint check_version_owner check (
    (student_id is not null and group_id is null) or
    (student_id is null and group_id is not null)
  )
);

create index if not exists idx_asgn_versions_assignment on public.assignment_code_versions(assignment_id);
create index if not exists idx_asgn_versions_student on public.assignment_code_versions(student_id, assignment_id);
create index if not exists idx_asgn_versions_group on public.assignment_code_versions(group_id, assignment_id);
create index if not exists idx_asgn_versions_created on public.assignment_code_versions(created_at desc);

alter table public.assignment_code_versions enable row level security;

-- Students can view only their own versions. Group members can view group versions. Teachers see all for their assignments.
create policy "Students can view own code versions"
  on public.assignment_code_versions for select
  using (
    public.is_admin() or
    auth.uid() = student_id or
    exists (
      select 1 from public.classroom_group_members cgm
      where cgm.group_id = assignment_code_versions.group_id and cgm.user_id = auth.uid()
    ) or
    exists (
      select 1 from public.classroom_assignments ca
      join public.classrooms c on c.id = ca.classroom_id
      where ca.id = assignment_code_versions.assignment_id and c.teacher_id = auth.uid()
    )
  );

-- Students can only insert their own versions
create policy "Students can insert own code versions"
  on public.assignment_code_versions for insert
  with check (
    auth.uid() = student_id or
    exists (
      select 1 from public.classroom_group_members cgm
      where cgm.group_id = assignment_code_versions.group_id and cgm.user_id = auth.uid()
    )
  );

-- Versions are immutable — no updates or deletes by regular users
create policy "Versions are immutable"
  on public.assignment_code_versions for update
  using (public.is_admin());

-- 2. ACTIVITY EVENTS
-- Attributable event log: every save, run, and submit is recorded.
create table if not exists public.assignment_activity_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.classroom_assignments(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('save', 'run', 'submit', 'grade', 'feedback', 'reopen')),
  version_id uuid references public.assignment_code_versions(id) on delete set null,
  submission_id uuid references public.classroom_submissions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_events_assignment on public.assignment_activity_events(assignment_id);
create index if not exists idx_activity_events_actor on public.assignment_activity_events(actor_id, assignment_id);
create index if not exists idx_activity_events_type on public.assignment_activity_events(event_type);
create index if not exists idx_activity_events_created on public.assignment_activity_events(created_at desc);

alter table public.assignment_activity_events enable row level security;

-- Teachers see all activity for their assignments; students see only their own events.
create policy "Students can view own activity events"
  on public.assignment_activity_events for select
  using (
    public.is_admin() or
    auth.uid() = actor_id or
    exists (
      select 1 from public.classroom_assignments ca
      join public.classrooms c on c.id = ca.classroom_id
      where ca.id = assignment_activity_events.assignment_id and c.teacher_id = auth.uid()
    )
  );

-- Any authenticated classroom member can insert events for their own actions
create policy "Authenticated users can insert own activity events"
  on public.assignment_activity_events for insert
  with check (auth.uid() = actor_id);

-- 3. SUBMISSION SNAPSHOTS
-- Immutable copy of exactly which code_version was formally submitted.
-- submission_id references classroom_submissions (the status/grade record).
-- version_id is the exact code version frozen at submission time.
create table if not exists public.submission_snapshots (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.classroom_submissions(id) on delete cascade,
  version_id uuid not null references public.assignment_code_versions(id) on delete restrict,
  assignment_id uuid not null references public.classroom_assignments(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  group_id uuid references public.classroom_groups(id) on delete cascade,
  -- Frozen copy of code_files at submission moment (denormalised for audit integrity)
  frozen_code_files jsonb not null default '{}'::jsonb,
  content_hash text not null,
  submitted_at timestamptz not null default now(),
  is_late boolean not null default false,
  unique (submission_id), -- one snapshot per submission
  constraint check_snapshot_owner check (
    (student_id is not null and group_id is null) or
    (student_id is null and group_id is not null)
  )
);

create index if not exists idx_snapshots_submission on public.submission_snapshots(submission_id);
create index if not exists idx_snapshots_version on public.submission_snapshots(version_id);
create index if not exists idx_snapshots_student on public.submission_snapshots(student_id, assignment_id);
create index if not exists idx_snapshots_group on public.submission_snapshots(group_id, assignment_id);

alter table public.submission_snapshots enable row level security;

create policy "Students can view own submission snapshots"
  on public.submission_snapshots for select
  using (
    public.is_admin() or
    auth.uid() = student_id or
    exists (
      select 1 from public.classroom_group_members cgm
      where cgm.group_id = submission_snapshots.group_id and cgm.user_id = auth.uid()
    ) or
    exists (
      select 1 from public.classroom_assignments ca
      join public.classrooms c on c.id = ca.classroom_id
      where ca.id = submission_snapshots.assignment_id and c.teacher_id = auth.uid()
    )
  );

-- Snapshots are written at submission time via service role only; no direct student inserts
create policy "Service can insert submission snapshots"
  on public.submission_snapshots for insert
  with check (
    auth.uid() = student_id or
    exists (
      select 1 from public.classroom_group_members cgm
      where cgm.group_id = submission_snapshots.group_id and cgm.user_id = auth.uid()
    )
  );

-- Snapshots are immutable
create policy "Submission snapshots are immutable"
  on public.submission_snapshots for update
  using (public.is_admin());

-- 4. EXECUTION LOGS
-- Records of code runs (public test cases only, or teacher-initiated full runs).
-- Hidden test case results are stored only as pass/fail counts — never exposing expected output.
create table if not exists public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  version_id uuid references public.assignment_code_versions(id) on delete set null,
  submission_id uuid references public.classroom_submissions(id) on delete set null,
  assignment_id uuid not null references public.classroom_assignments(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  language text not null default 'cpp',
  stdin text not null default '',
  stdout text,
  stderr text,
  exit_code integer,
  duration_ms integer,
  -- For test-case runs: summarised results (never raw hidden test definitions)
  public_tests_passed integer,
  public_tests_total integer,
  hidden_tests_passed integer,  -- only written by server; never returned to students
  hidden_tests_total integer,   -- only written by server; never returned to students
  run_mode text not null default 'manual' check (run_mode in ('manual', 'auto_grade', 'teacher_review')),
  created_at timestamptz not null default now()
);

create index if not exists idx_exec_logs_version on public.execution_logs(version_id);
create index if not exists idx_exec_logs_actor on public.execution_logs(actor_id, assignment_id);
create index if not exists idx_exec_logs_submission on public.execution_logs(submission_id);
create index if not exists idx_exec_logs_created on public.execution_logs(created_at desc);

alter table public.execution_logs enable row level security;

-- Students can see their own run logs but NOT hidden test pass/fail (filtered by API layer).
-- Teachers can see all logs for their assignments.
create policy "Students can view own execution logs"
  on public.execution_logs for select
  using (
    public.is_admin() or
    auth.uid() = actor_id or
    exists (
      select 1 from public.classroom_assignments ca
      join public.classrooms c on c.id = ca.classroom_id
      where ca.id = execution_logs.assignment_id and c.teacher_id = auth.uid()
    )
  );

create policy "Authenticated users can insert own execution logs"
  on public.execution_logs for insert
  with check (auth.uid() = actor_id);

-- 5. ASSIGNMENT RUBRICS
-- Structured grading criteria per assignment. One rubric, multiple items.
create table if not exists public.assignment_rubrics (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.classroom_assignments(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  -- items: [{ id, description, maxPoints }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id)
);

alter table public.assignment_rubrics enable row level security;

create policy "Classroom members can view rubrics"
  on public.assignment_rubrics for select
  using (
    public.is_admin() or
    exists (
      select 1 from public.classroom_assignments ca
      join public.classroom_members cm on cm.classroom_id = ca.classroom_id
      where ca.id = assignment_rubrics.assignment_id and cm.user_id = auth.uid()
    )
  );

create policy "Teachers can manage rubrics"
  on public.assignment_rubrics for all
  using (
    public.is_admin() or
    exists (
      select 1 from public.classroom_assignments ca
      join public.classrooms c on c.id = ca.classroom_id
      where ca.id = assignment_rubrics.assignment_id and c.teacher_id = auth.uid()
    )
  );

-- 6. SUBMISSION GRADES
-- Each grade row MUST reference the exact snapshot version that was graded.
-- This guarantees grade traceability.
create table if not exists public.submission_grades (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.classroom_submissions(id) on delete cascade,
  snapshot_id uuid not null references public.submission_snapshots(id) on delete restrict,
  -- version_id is denormalised here for fast lookup; must match snapshot.version_id
  version_id uuid not null references public.assignment_code_versions(id) on delete restrict,
  rubric_scores jsonb not null default '{}'::jsonb,
  -- rubric_scores: { [rubricItemId]: pointsAwarded }
  auto_test_points numeric not null default 0,
  manual_points numeric not null default 0,
  total_points numeric not null default 0,
  max_points numeric not null default 100,
  graded_by uuid not null references public.profiles(id) on delete restrict,
  grade_mode text not null default 'manual' check (grade_mode in ('auto', 'manual', 'mixed')),
  graded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id) -- one grade record per submission; update in place
);

create index if not exists idx_grades_submission on public.submission_grades(submission_id);
create index if not exists idx_grades_version on public.submission_grades(version_id);
create index if not exists idx_grades_graded_by on public.submission_grades(graded_by);

alter table public.submission_grades enable row level security;

-- Students see their own grades. Teachers see all grades for their assignments.
create policy "Students can view own grades"
  on public.submission_grades for select
  using (
    public.is_admin() or
    exists (
      select 1 from public.classroom_submissions cs
      where cs.id = submission_grades.submission_id
        and (cs.student_id = auth.uid() or
          exists (
            select 1 from public.classroom_group_members cgm
            where cgm.group_id = cs.group_id and cgm.user_id = auth.uid()
          ))
    ) or
    exists (
      select 1 from public.classroom_submissions cs
      join public.classroom_assignments ca on ca.id = cs.assignment_id
      join public.classrooms c on c.id = ca.classroom_id
      where cs.id = submission_grades.submission_id and c.teacher_id = auth.uid()
    )
  );

create policy "Teachers can manage grades"
  on public.submission_grades for all
  using (
    public.is_admin() or
    exists (
      select 1 from public.classroom_submissions cs
      join public.classroom_assignments ca on ca.id = cs.assignment_id
      join public.classrooms c on c.id = ca.classroom_id
      where cs.id = submission_grades.submission_id and c.teacher_id = auth.uid()
    )
  );

-- 7. SUBMISSION FEEDBACK
-- Teacher annotations on a submission.
create table if not exists public.submission_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.classroom_submissions(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  comment text not null check (char_length(trim(comment)) between 1 and 5000),
  -- Optional: reference a specific file/line for inline comments
  file_name text,
  line_number integer check (line_number is null or line_number > 0),
  is_private boolean not null default false, -- private = only teacher sees
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_feedback_submission on public.submission_feedback(submission_id);
create index if not exists idx_feedback_teacher on public.submission_feedback(teacher_id);

alter table public.submission_feedback enable row level security;

create policy "Students can view non-private feedback on own submissions"
  on public.submission_feedback for select
  using (
    public.is_admin() or
    auth.uid() = teacher_id or
    (
      is_private = false and
      exists (
        select 1 from public.classroom_submissions cs
        where cs.id = submission_feedback.submission_id
          and (cs.student_id = auth.uid() or
            exists (
              select 1 from public.classroom_group_members cgm
              where cgm.group_id = cs.group_id and cgm.user_id = auth.uid()
            ))
      )
    ) or
    exists (
      select 1 from public.classroom_submissions cs
      join public.classroom_assignments ca on ca.id = cs.assignment_id
      join public.classrooms c on c.id = ca.classroom_id
      where cs.id = submission_feedback.submission_id and c.teacher_id = auth.uid()
    )
  );

create policy "Teachers can manage feedback"
  on public.submission_feedback for all
  using (
    public.is_admin() or
    exists (
      select 1 from public.classroom_submissions cs
      join public.classroom_assignments ca on ca.id = cs.assignment_id
      join public.classrooms c on c.id = ca.classroom_id
      where cs.id = submission_feedback.submission_id and c.teacher_id = auth.uid()
    )
  );

-- 8. GROUP CONTRIBUTION REPORTS
-- Aggregated per-student contribution stats for group submissions.
create table if not exists public.group_contribution_reports (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.classroom_submissions(id) on delete cascade,
  group_id uuid not null references public.classroom_groups(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  save_event_count integer not null default 0,
  run_event_count integer not null default 0,
  total_event_count integer not null default 0,
  last_active_at timestamptz,
  computed_at timestamptz not null default now(),
  unique (submission_id, student_id)
);

create index if not exists idx_contribution_submission on public.group_contribution_reports(submission_id);
create index if not exists idx_contribution_group on public.group_contribution_reports(group_id);

alter table public.group_contribution_reports enable row level security;

create policy "Group members and teachers can view contribution reports"
  on public.group_contribution_reports for select
  using (
    public.is_admin() or
    auth.uid() = student_id or
    exists (
      select 1 from public.classroom_group_members cgm
      where cgm.group_id = group_contribution_reports.group_id and cgm.user_id = auth.uid()
    ) or
    exists (
      select 1 from public.classroom_submissions cs
      join public.classroom_assignments ca on ca.id = cs.assignment_id
      join public.classrooms c on c.id = ca.classroom_id
      where cs.id = group_contribution_reports.submission_id and c.teacher_id = auth.uid()
    )
  );

create policy "Service role can manage contribution reports"
  on public.group_contribution_reports for all
  using (public.is_admin());
