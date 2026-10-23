-- Required by the submit route's atomic upsert. PostgreSQL's default NULL
-- semantics permit the other ownership mode while enforcing one submission
-- per assignment/student or assignment/group. Existing duplicates cause this
-- migration to fail safely; no historical rows are deleted.
begin;
create unique index if not exists classroom_submissions_assignment_student_unique
  on public.classroom_submissions (assignment_id, student_id);
create unique index if not exists classroom_submissions_assignment_group_unique
  on public.classroom_submissions (assignment_id, group_id);
commit;
