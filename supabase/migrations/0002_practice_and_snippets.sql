-- ==============================================================================
-- OutputTracer: Practice Tracking & Saved Snippets
-- Adds personal saved snippets and interactive practice progress tracking
-- ==============================================================================

-- 1. SAVED CODE SNIPPETS
create table if not exists public.saved_snippets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'Untitled Program',
  description text,
  files jsonb not null default '{"main.cpp": ""}'::jsonb,
  stdin text default '',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_saved_snippets_user_id on public.saved_snippets(user_id);
create index if not exists idx_saved_snippets_created_at on public.saved_snippets(created_at desc);

-- Enable RLS on saved_snippets
alter table public.saved_snippets enable row level security;

-- Saved Snippets RLS Policies
create policy "Users can read own saved snippets"
  on public.saved_snippets for select
  using (auth.uid() = user_id);

create policy "Users can insert own saved snippets"
  on public.saved_snippets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own saved snippets"
  on public.saved_snippets for update
  using (auth.uid() = user_id);

create policy "Users can delete own saved snippets"
  on public.saved_snippets for delete
  using (auth.uid() = user_id);


-- 2. PRACTICE PROGRESS (Aggregated completion state per question)
create table if not exists public.practice_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  topic_id text not null,
  question_id text not null,
  is_completed boolean default false not null,
  attempts_count int default 1 not null,
  last_submitted_at timestamptz default now() not null,
  constraint unique_user_topic_question unique (user_id, topic_id, question_id)
);

create index if not exists idx_practice_progress_user on public.practice_progress(user_id);
create index if not exists idx_practice_progress_topic on public.practice_progress(user_id, topic_id);

-- Enable RLS on practice_progress
alter table public.practice_progress enable row level security;

-- Practice Progress RLS Policies
create policy "Users can read own practice progress"
  on public.practice_progress for select
  using (auth.uid() = user_id);

create policy "Users can insert own practice progress"
  on public.practice_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update own practice progress"
  on public.practice_progress for update
  using (auth.uid() = user_id);


-- 3. PRACTICE SUBMISSIONS (Audit log of all question attempts)
create table if not exists public.practice_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  topic_id text not null,
  question_id text not null,
  submitted_output text not null,
  is_correct boolean not null,
  created_at timestamptz default now() not null
);

create index if not exists idx_practice_submissions_user on public.practice_submissions(user_id);
create index if not exists idx_practice_submissions_question on public.practice_submissions(user_id, topic_id, question_id);

-- Enable RLS on practice_submissions
alter table public.practice_submissions enable row level security;

-- Practice Submissions RLS Policies
create policy "Users can read own submissions"
  on public.practice_submissions for select
  using (auth.uid() = user_id);

create policy "Users can insert own submissions"
  on public.practice_submissions for insert
  with check (auth.uid() = user_id);
