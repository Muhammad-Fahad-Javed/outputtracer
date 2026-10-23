-- Keep immutable snapshots for every hand-in, including resubmissions.
-- Existing snapshots and grades that reference them remain unchanged.
begin;

alter table public.submission_snapshots
  drop constraint if exists submission_snapshots_submission_id_key;

create index if not exists idx_snapshots_submission_latest
  on public.submission_snapshots (submission_id, submitted_at desc, id desc);

commit;
