-- ==============================================================================
-- OutputTracer Learn: Protect trusted answers from public reads
-- (0004_learn_protect_answers.sql)
-- ==============================================================================
--
-- Why this is needed
-- ------------------
-- public.learn_questions has a row-level policy that lets anyone read published
-- questions (good), but RLS controls ROWS, not COLUMNS. The anon key is public
-- and is shipped to the browser, so any client could previously fetch the
-- trusted answer directly:
--
--     GET https://<project>.supabase.co/rest/v1/learn_questions?select=answer
--
-- The application grades submissions server-side with the service-role client,
-- which keeps its own privileges, so it does not need public read access to the
-- `answer` column.
--
-- What this does
-- --------------
-- 1. Remove the table-wide SELECT that anon/authenticated inherit by default.
-- 2. Re-grant SELECT on every column EXCEPT `answer`.
--
-- `answer` is confirmed to be the only column removed. Selections by the
-- service role (server-side grading/admin) are unaffected.
--
-- Safety
-- ------
-- Non-destructive: no rows or schema objects are altered. Fully reversible with:
--
--     grant select on public.learn_questions to anon, authenticated;
--
-- Note: a column-level grant only takes effect once the table-wide grant is
-- revoked, which is why both statements are required.
-- ==============================================================================

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
  explanation,
  hint,
  points,
  difficulty,
  display_order,
  is_published,
  created_at,
  updated_at
) on public.learn_questions to anon, authenticated;
