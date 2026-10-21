-- Practice completion must be written by the server after it grades the answer.
-- Authenticated users keep SELECT on their own rows. INSERT and UPDATE are
-- removed so a browser session cannot mark a question correct.
-- The service role bypasses RLS and is what /api/practice/grade uses.
-- This migration does not delete rows and does not disable RLS.
-- It has not been applied to production by this change.

drop policy if exists "Users can insert own practice progress" on public.practice_progress;
drop policy if exists "Users can update own practice progress" on public.practice_progress;
drop policy if exists "Users can insert own submissions" on public.practice_submissions;
