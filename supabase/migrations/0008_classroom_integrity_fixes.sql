-- ==============================================================================
-- OutputTracer: Classroom Data Integrity & Uniqueness Fixes (0008_classroom_integrity_fixes.sql)
-- Addresses:
--   1. SEC-03: Add partial unique constraints for classroom_submissions so that
--      UPSERT ON CONFLICT (assignment_id, student_id) and (assignment_id, group_id)
--      operate with deterministic database-level safety.
--   2. SEC-02: Add partial unique constraints for assignment_code_versions so that
--      concurrent version writes cannot produce duplicate version_number entries.
--
-- NOTE: DO NOT EXECUTE DIRECTLY ON PRODUCTION WITHOUT STAGING VALIDATION.
-- ==============================================================================

-- 1. CLASSROOM SUBMISSIONS CONSTRAINTS
-- Guarantee exactly one active submission record per student per assignment
create unique index if not exists uq_classroom_submissions_student
  on public.classroom_submissions(assignment_id, student_id)
  where student_id is not null;

-- Guarantee exactly one active submission record per group per assignment
create unique index if not exists uq_classroom_submissions_group
  on public.classroom_submissions(assignment_id, group_id)
  where group_id is not null;

-- 2. ASSIGNMENT CODE VERSIONS CONSTRAINTS
-- Guarantee strictly sequential version numbers per student per assignment
create unique index if not exists uq_assignment_code_versions_student_version
  on public.assignment_code_versions(assignment_id, student_id, version_number)
  where student_id is not null;

-- Guarantee strictly sequential version numbers per group per assignment
create unique index if not exists uq_assignment_code_versions_group_version
  on public.assignment_code_versions(assignment_id, group_id, version_number)
  where group_id is not null;

-- 3. AUDIT & LOGGING INDEXES
create index if not exists idx_asgn_code_versions_hash
  on public.assignment_code_versions(content_hash);
