-- ==============================================================================
-- OutputTracer: close privilege gaps found in the security audit
-- (0013_close_privilege_gaps.sql)
--
-- This migration does not delete rows and does not disable row level security.
-- The service role (server-side admin client) bypasses these policies and is
-- how the application writes grades, progress, versions, and audit logs.
--
-- Apply it in the Supabase SQL editor or via the migration runner after review.
-- It is not applied by deploying the Next.js process.
-- ==============================================================================

-- 1. Profiles. The broad "any signed-in user can read every profile" policy
-- overrides the narrower peer policy from 0001 because Postgres ORs permissive
-- policies. Drop the broad one. Own-row and project/group-peer reads remain.
drop policy if exists "Authenticated users can view profiles" on public.profiles;

-- Table-level UPDATE lets the owner change email. Invite RPCs look profiles up
-- by email, so a forged email accepts someone else's invitation. Keep updates
-- for the columns the profile form writes. Email stays a copy of auth.users.
revoke update on table public.profiles from anon, authenticated;
grant update (
  display_name,
  full_name,
  username,
  avatar_url,
  phone,
  bio,
  country,
  city,
  preferred_languages,
  updated_at
) on public.profiles to authenticated;

-- 2. Learn answers. 0004 removed `answer` but left `explanation`, and the seed
-- explanations restate the answer. Lesson expected output has the same problem.
revoke select on public.learn_questions from anon, authenticated;
grant select (
  id,
  lesson_id,
  course_id,
  type,
  title,
  question_text,
  code_snippet,
  options,
  hint,
  points,
  difficulty,
  display_order,
  is_published,
  created_at,
  updated_at
) on public.learn_questions to anon, authenticated;

revoke select on public.learn_lessons from anon, authenticated;
grant select (
  id,
  module_id,
  course_id,
  title,
  notes,
  code_snippet,
  display_order,
  is_published,
  created_at,
  updated_at
) on public.learn_lessons to anon, authenticated;

-- Progress rows are written by the service role after grading. A user JWT must
-- not be able to insert a perfect score or mark an arbitrary lesson complete.
drop policy if exists "Users can insert own lesson completions" on public.learn_lesson_completions;
drop policy if exists "Users can insert own question attempts" on public.learn_question_attempts;

-- 3. Classroom assignments. RLS cannot hide a column. Move hidden tests out of
-- the columns authenticated roles can select. The server reads them with the
-- service role.
revoke select on public.classroom_assignments from anon, authenticated;
grant select (
  id,
  classroom_id,
  title,
  description,
  starter_code,
  public_test_cases,
  due_date,
  allow_late,
  max_points,
  group_mode,
  is_published,
  created_at,
  updated_at
) on public.classroom_assignments to authenticated;

-- Students must not insert a graded row, or a row for a class they are not in.
drop policy if exists "Students can insert own submissions" on public.classroom_submissions;
create policy "Students can insert own ungraded submissions"
  on public.classroom_submissions for insert
  to authenticated
  with check (
    status = 'submitted'
    and grade is null
    and feedback is null
    and graded_by is null
    and graded_at is null
    and exists (
      select 1
      from public.classroom_assignments a
      join public.classroom_members m on m.classroom_id = a.classroom_id
      where a.id = classroom_submissions.assignment_id
        and m.user_id = auth.uid()
        and a.is_published = true
    )
    and (
      (student_id = auth.uid() and group_id is null)
      or (
        student_id is null
        and group_id is not null
        and exists (
          select 1 from public.classroom_group_members cgm
          where cgm.group_id = classroom_submissions.group_id
            and cgm.user_id = auth.uid()
        )
      )
    )
  );

-- Audit rows, code versions, snapshots, and execution logs are written by the
-- service role. The previous insert policies let any signed-in user forge them.
drop policy if exists "Authenticated users can insert audit records" on public.classroom_audit_logs;
drop policy if exists "Students can insert own code versions" on public.assignment_code_versions;
drop policy if exists "Service can insert submission snapshots" on public.submission_snapshots;
drop policy if exists "Authenticated users can insert own execution logs" on public.execution_logs;

revoke select on public.execution_logs from anon, authenticated;
grant select (
  id,
  version_id,
  submission_id,
  assignment_id,
  actor_id,
  language,
  stdin,
  stdout,
  stderr,
  exit_code,
  duration_ms,
  public_tests_passed,
  public_tests_total,
  run_mode,
  created_at
) on public.execution_logs to authenticated;
