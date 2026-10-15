-- ==============================================================================
-- OutputTracer: Classroom Platform & Teacher Verification (0005_classroom_platform.sql)
-- Phase 1: Role, Scoped Permissions, Teacher Verification, and Audit Logging
-- ==============================================================================

-- 1. TEACHER APPLICATIONS
create table if not exists public.teacher_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending_review'
    check (status in ('draft', 'pending_review', 'info_requested', 'approved', 'rejected', 'suspended')),
  institution_name text not null check (char_length(trim(institution_name)) between 2 and 160),
  institution_email text check (institution_email is null or char_length(trim(institution_email)) <= 255),
  department text check (department is null or char_length(trim(department)) <= 120),
  courses_intended text check (courses_intended is null or char_length(trim(courses_intended)) <= 500),
  evidence_notes text not null check (char_length(trim(evidence_notes)) between 5 and 2000),
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewer_notes text check (reviewer_notes is null or char_length(trim(reviewer_notes)) <= 2000),
  decision_reason_code text check (decision_reason_code is null or decision_reason_code in (
    'verified_credentials',
    'institutional_affiliation_confirmed',
    'insufficient_evidence',
    'invalid_affiliation',
    'policy_violation',
    'other'
  )),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_teacher_applications_user on public.teacher_applications(user_id);
create index if not exists idx_teacher_applications_status on public.teacher_applications(status);
create index if not exists idx_teacher_applications_submitted on public.teacher_applications(submitted_at desc);

alter table public.teacher_applications enable row level security;

-- Applicants can view only their own applications; Admins can view all applications.
create policy "Users can view own teacher application"
  on public.teacher_applications for select
  using (auth.uid() = user_id or public.is_admin());

-- Applicants can create their application in draft or pending_review status only.
create policy "Users can submit own teacher application"
  on public.teacher_applications for insert
  with check (auth.uid() = user_id and status in ('draft', 'pending_review'));

-- Applicants can update their application only while in draft or info_requested status.
create policy "Users can update own non-final application"
  on public.teacher_applications for update
  using (auth.uid() = user_id and status in ('draft', 'info_requested'))
  with check (auth.uid() = user_id and status in ('draft', 'pending_review'));

-- Admins have full access to inspect and update applications.
create policy "Admins can manage all teacher applications"
  on public.teacher_applications for all
  using (public.is_admin())
  with check (public.is_admin());

-- 2. TEACHER PROFILES (Verified Status)
create table if not exists public.teacher_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'approved'
    check (status in ('approved', 'suspended', 'revoked')),
  application_id uuid references public.teacher_applications(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz not null default now(),
  suspended_at timestamptz,
  suspension_reason text check (suspension_reason is null or char_length(trim(suspension_reason)) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_teacher_profiles_status on public.teacher_profiles(status);

alter table public.teacher_profiles enable row level security;

-- Authenticated members can read teacher profiles (e.g. to see if a classroom creator is a verified teacher)
create policy "Authenticated users can read teacher profiles"
  on public.teacher_profiles for select
  using (auth.uid() is not null);

-- Only admins or the service role can grant, update, or revoke verified teacher status
create policy "Admins can manage teacher profiles"
  on public.teacher_profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- Helper function to check if a user is a verified teacher (Security Definer)
create or replace function public.is_verified_teacher(target_user_id uuid default null)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.teacher_profiles
    where user_id = coalesce(target_user_id, auth.uid())
      and status = 'approved'
  );
$$;

-- 3. CLASSROOM AUDIT LOGS
create table if not exists public.classroom_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 3 and 80),
  target_type text not null check (target_type in (
    'teacher_application',
    'teacher_profile',
    'classroom',
    'classroom_assignment',
    'submission',
    'user'
  )),
  target_id text not null,
  details jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists idx_classroom_audit_actor on public.classroom_audit_logs(actor_id);
create index if not exists idx_classroom_audit_action on public.classroom_audit_logs(action);
create index if not exists idx_classroom_audit_target on public.classroom_audit_logs(target_type, target_id);
create index if not exists idx_classroom_audit_created on public.classroom_audit_logs(created_at desc);

alter table public.classroom_audit_logs enable row level security;

-- Only admins can inspect audit logs
create policy "Admins can inspect audit logs"
  on public.classroom_audit_logs for select
  using (public.is_admin());

-- Authorized users and services can insert audit records for their operations
create policy "Authenticated users can insert audit records"
  on public.classroom_audit_logs for insert
  with check (auth.uid() is not null and (actor_id = auth.uid() or actor_id is null or public.is_admin()));

-- ==============================================================================
-- Phase 2: Classrooms, Membership, Groups, and Assignments
-- ==============================================================================

-- 4. CLASSROOMS
create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  subject text not null default 'Computer Science' check (char_length(trim(subject)) between 1 and 80),
  description text not null default '',
  join_code text unique not null check (char_length(join_code) between 6 and 12),
  is_archived boolean not null default false,
  settings jsonb not null default '{"allowStudentDiscussions": true, "requireApprovalToJoin": false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_classrooms_teacher on public.classrooms(teacher_id);
create index if not exists idx_classrooms_join_code on public.classrooms(join_code);
create index if not exists idx_classrooms_archived on public.classrooms(is_archived);

alter table public.classrooms enable row level security;

-- Classrooms can be viewed by their enrolled members or platform admins
create policy "Members and admins can view classrooms"
  on public.classrooms for select
  using (
    public.is_admin() or
    auth.uid() = teacher_id or
    exists (
      select 1 from public.classroom_members cm
      where cm.classroom_id = classrooms.id and cm.user_id = auth.uid()
    )
  );

-- Only verified teachers can create classrooms
create policy "Verified teachers can insert classrooms"
  on public.classrooms for insert
  with check (
    auth.uid() = teacher_id and
    (public.is_verified_teacher(auth.uid()) or public.is_admin())
  );

-- Only classroom teacher or admin can update
create policy "Classroom owner can update classroom"
  on public.classrooms for update
  using (auth.uid() = teacher_id or public.is_admin());

-- 5. CLASSROOM MEMBERS (Roster)
create table if not exists public.classroom_members (
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'student' check (role in ('teacher', 'assistant', 'student')),
  joined_at timestamptz not null default now(),
  primary key (classroom_id, user_id)
);

create index if not exists idx_classroom_members_user on public.classroom_members(user_id);
create index if not exists idx_classroom_members_class on public.classroom_members(classroom_id, role);

alter table public.classroom_members enable row level security;

-- Enrolled members can view the classroom roster
create policy "Classroom members can view roster"
  on public.classroom_members for select
  using (
    public.is_admin() or
    exists (
      select 1 from public.classroom_members self_m
      where self_m.classroom_id = classroom_members.classroom_id and self_m.user_id = auth.uid()
    )
  );

-- Students can insert themselves if joining with valid code (handled via service role / RPC)
create policy "Teachers can manage classroom members"
  on public.classroom_members for all
  using (
    public.is_admin() or
    exists (
      select 1 from public.classrooms c
      where c.id = classroom_members.classroom_id and c.teacher_id = auth.uid()
    )
  );

-- 6. CLASSROOM GROUPS
create table if not exists public.classroom_groups (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create index if not exists idx_classroom_groups_class on public.classroom_groups(classroom_id);

alter table public.classroom_groups enable row level security;

create policy "Classroom members can view groups"
  on public.classroom_groups for select
  using (
    public.is_admin() or
    exists (
      select 1 from public.classroom_members cm
      where cm.classroom_id = classroom_groups.classroom_id and cm.user_id = auth.uid()
    )
  );

create policy "Teachers can manage classroom groups"
  on public.classroom_groups for all
  using (
    public.is_admin() or
    exists (
      select 1 from public.classrooms c
      where c.id = classroom_groups.classroom_id and c.teacher_id = auth.uid()
    )
  );

-- 7. CLASSROOM GROUP MEMBERS
create table if not exists public.classroom_group_members (
  group_id uuid not null references public.classroom_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (group_id, user_id)
);

create index if not exists idx_group_members_user on public.classroom_group_members(user_id);

alter table public.classroom_group_members enable row level security;

create policy "Classroom members can view group membership"
  on public.classroom_group_members for select
  using (
    public.is_admin() or
    exists (
      select 1 from public.classroom_groups cg
      join public.classroom_members cm on cm.classroom_id = cg.classroom_id
      where cg.id = classroom_group_members.group_id and cm.user_id = auth.uid()
    )
  );

create policy "Teachers can manage group members"
  on public.classroom_group_members for all
  using (
    public.is_admin() or
    exists (
      select 1 from public.classroom_groups cg
      join public.classrooms c on c.id = cg.classroom_id
      where cg.id = classroom_group_members.group_id and c.teacher_id = auth.uid()
    )
  );

-- 8. CLASSROOM ASSIGNMENTS
create table if not exists public.classroom_assignments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text not null default '',
  starter_code jsonb not null default '{"main.cpp": "// Write your solution here\\n#include <iostream>\\n\\nint main() {\\n    std::cout << \\"Hello, World!\\" << std::endl;\\n    return 0;\\n}\\n"}'::jsonb,
  public_test_cases jsonb not null default '[]'::jsonb,
  hidden_test_cases jsonb not null default '[]'::jsonb,
  due_date timestamptz,
  allow_late boolean not null default true,
  max_points numeric not null default 100 check (max_points >= 0),
  group_mode boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assignments_classroom on public.classroom_assignments(classroom_id, is_published);
create index if not exists idx_assignments_due on public.classroom_assignments(due_date);

alter table public.classroom_assignments enable row level security;

-- Students can read published assignments in their classroom. Teachers can read all.
create policy "Members can view permitted classroom assignments"
  on public.classroom_assignments for select
  using (
    public.is_admin() or
    exists (
      select 1 from public.classrooms c
      where c.id = classroom_assignments.classroom_id and c.teacher_id = auth.uid()
    ) or
    (
      is_published = true and
      exists (
        select 1 from public.classroom_members cm
        where cm.classroom_id = classroom_assignments.classroom_id and cm.user_id = auth.uid()
      )
    )
  );

create policy "Teachers can manage classroom assignments"
  on public.classroom_assignments for all
  using (
    public.is_admin() or
    exists (
      select 1 from public.classrooms c
      where c.id = classroom_assignments.classroom_id and c.teacher_id = auth.uid()
    )
  );

-- 9. SUBMISSIONS & INITIAL STATUS TRACKING
create table if not exists public.classroom_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.classroom_assignments(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  group_id uuid references public.classroom_groups(id) on delete cascade,
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'graded', 'returned')),
  code_files jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  is_late boolean not null default false,
  grade numeric check (grade is null or grade >= 0),
  feedback text,
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint check_student_or_group check (
    (student_id is not null and group_id is null) or
    (student_id is null and group_id is not null)
  )
);

create index if not exists idx_submissions_assignment on public.classroom_submissions(assignment_id);
create index if not exists idx_submissions_student on public.classroom_submissions(student_id);
create index if not exists idx_submissions_group on public.classroom_submissions(group_id);

alter table public.classroom_submissions enable row level security;

-- Students can read only their own submissions. Teachers can read all for their assignments.
create policy "Students can view own submissions"
  on public.classroom_submissions for select
  using (
    public.is_admin() or
    auth.uid() = student_id or
    exists (
      select 1 from public.classroom_group_members cgm
      where cgm.group_id = classroom_submissions.group_id and cgm.user_id = auth.uid()
    ) or
    exists (
      select 1 from public.classroom_assignments ca
      join public.classrooms c on c.id = ca.classroom_id
      where ca.id = classroom_submissions.assignment_id and c.teacher_id = auth.uid()
    )
  );

create policy "Students can insert own submissions"
  on public.classroom_submissions for insert
  with check (
    auth.uid() = student_id or
    exists (
      select 1 from public.classroom_group_members cgm
      where cgm.group_id = classroom_submissions.group_id and cgm.user_id = auth.uid()
    )
  );
