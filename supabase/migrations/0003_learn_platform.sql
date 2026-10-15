-- ==============================================================================
-- OutputTracer: Learn Platform & Course Management Migration (0003_learn_platform.sql)
-- Complete additive schema for Courses, Modules, Lessons, Practice Questions,
-- Quizzes, Student Progress Tracking, and Administrative Role Security.
-- ==============================================================================

-- 1. APP ROLES / ADMIN PERMISSION TABLE
create table if not exists public.app_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null check (role in ('admin', 'staff', 'student')),
  created_at timestamptz not null default now(),
  constraint unique_user_app_role unique (user_id, role)
);

create index if not exists idx_app_roles_user on public.app_roles(user_id);
create index if not exists idx_app_roles_role on public.app_roles(role);

alter table public.app_roles enable row level security;

-- App Roles RLS: Users can read their own roles; only service_role/admins can modify
create policy "Users can read own app roles"
  on public.app_roles for select
  using (auth.uid() = user_id);

-- Helper function to check if current user is an admin (Security Definer)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.app_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- 2. PROGRAMMING LANGUAGES (Extensible beyond C++ and 8086 Assembly)
create table if not exists public.learn_languages (
  id text primary key, -- e.g. 'cpp', 'asm8086', 'python'
  name text not null, -- e.g. 'C++', '8086 NASM Assembly'
  description text not null default '',
  icon text not null default 'Code',
  display_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.learn_languages enable row level security;

create policy "Public can read published languages"
  on public.learn_languages for select
  using (is_published = true or public.is_admin());

create policy "Admins can insert languages"
  on public.learn_languages for insert
  with check (public.is_admin());

create policy "Admins can update languages"
  on public.learn_languages for update
  using (public.is_admin());

create policy "Admins can delete languages"
  on public.learn_languages for delete
  using (public.is_admin());

-- 3. COURSES
create table if not exists public.learn_courses (
  id text primary key, -- slug identifier e.g. 'cpp-fundamentals', '8086-assembly-mastery'
  language_id text references public.learn_languages(id) on delete cascade not null,
  title text not null,
  description text not null default '',
  difficulty text not null default 'Beginner' check (difficulty in ('Beginner', 'Intermediate', 'Advanced', 'All Levels')),
  estimated_duration text not null default '4-6 hours',
  thumbnail_icon text not null default 'BookOpen',
  display_order int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_learn_courses_lang on public.learn_courses(language_id);
create index if not exists idx_learn_courses_published on public.learn_courses(is_published, display_order);

alter table public.learn_courses enable row level security;

create policy "Public can read published courses"
  on public.learn_courses for select
  using (is_published = true or public.is_admin());

create policy "Admins can insert courses"
  on public.learn_courses for insert
  with check (public.is_admin());

create policy "Admins can update courses"
  on public.learn_courses for update
  using (public.is_admin());

create policy "Admins can delete courses"
  on public.learn_courses for delete
  using (public.is_admin());

-- 4. COURSE MODULES / TOPICS
create table if not exists public.learn_modules (
  id text primary key, -- e.g. 'cpp-intro-vars', 'asm-registers'
  course_id text references public.learn_courses(id) on delete cascade not null,
  title text not null,
  description text not null default '',
  display_order int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_learn_modules_course on public.learn_modules(course_id, display_order);

alter table public.learn_modules enable row level security;

create policy "Public can read published modules"
  on public.learn_modules for select
  using (is_published = true or public.is_admin());

create policy "Admins can manage modules"
  on public.learn_modules for all
  using (public.is_admin());

-- 5. LESSONS
create table if not exists public.learn_lessons (
  id text primary key, -- slug or unique code e.g. 'variables-and-data-types', 'asm-mov-instruction'
  module_id text references public.learn_modules(id) on delete cascade not null,
  course_id text references public.learn_courses(id) on delete cascade not null,
  title text not null,
  notes text not null default '', -- Structured markdown educational content
  code_snippet text default '',
  expected_output text default '',
  explanation text default '',
  display_order int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_learn_lessons_module on public.learn_lessons(module_id, display_order);
create index if not exists idx_learn_lessons_course on public.learn_lessons(course_id, display_order);

alter table public.learn_lessons enable row level security;

create policy "Public can read published lessons"
  on public.learn_lessons for select
  using (is_published = true or public.is_admin());

create policy "Admins can manage lessons"
  on public.learn_lessons for all
  using (public.is_admin());

-- 6. PRACTICE QUESTIONS & QUIZZES
create table if not exists public.learn_questions (
  id text primary key, -- e.g. 'q-cpp-var-scope-01', 'q-asm-inc-flags-01'
  lesson_id text references public.learn_lessons(id) on delete set null,
  course_id text references public.learn_courses(id) on delete cascade not null,
  type text not null default 'exact_output' check (type in ('multiple_choice', 'true_false', 'exact_output', 'code_trace', 'short_answer')),
  title text not null,
  question_text text not null,
  code_snippet text default '',
  options jsonb default '[]'::jsonb, -- Array of strings for MCQs / choices
  answer text not null, -- Trusted answer on server side
  explanation text not null default '',
  hint text default '',
  points int not null default 10,
  difficulty text not null default 'Medium' check (difficulty in ('Easy', 'Medium', 'Hard')),
  display_order int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_learn_questions_lesson on public.learn_questions(lesson_id, display_order);
create index if not exists idx_learn_questions_course on public.learn_questions(course_id, display_order);

alter table public.learn_questions enable row level security;

create policy "Public can read published questions"
  on public.learn_questions for select
  using (is_published = true or public.is_admin());

create policy "Admins can manage questions"
  on public.learn_questions for all
  using (public.is_admin());

-- 7. STUDENT ENROLLMENTS
create table if not exists public.learn_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  course_id text references public.learn_courses(id) on delete cascade not null,
  last_accessed_lesson_id text references public.learn_lessons(id) on delete set null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_user_course_enrollment unique (user_id, course_id)
);

create index if not exists idx_learn_enrollments_user on public.learn_enrollments(user_id);
create index if not exists idx_learn_enrollments_course on public.learn_enrollments(course_id);

alter table public.learn_enrollments enable row level security;

create policy "Users can read own enrollments"
  on public.learn_enrollments for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert own enrollments"
  on public.learn_enrollments for insert
  with check (auth.uid() = user_id);

create policy "Users can update own enrollments"
  on public.learn_enrollments for update
  using (auth.uid() = user_id or public.is_admin());

-- 8. LESSON COMPLETIONS
create table if not exists public.learn_lesson_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  course_id text references public.learn_courses(id) on delete cascade not null,
  lesson_id text references public.learn_lessons(id) on delete cascade not null,
  completed_at timestamptz not null default now(),
  constraint unique_user_lesson_completion unique (user_id, lesson_id)
);

create index if not exists idx_learn_completions_user_course on public.learn_lesson_completions(user_id, course_id);
create index if not exists idx_learn_completions_lesson on public.learn_lesson_completions(lesson_id);

alter table public.learn_lesson_completions enable row level security;

create policy "Users can read own lesson completions"
  on public.learn_lesson_completions for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert own lesson completions"
  on public.learn_lesson_completions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own lesson completions"
  on public.learn_lesson_completions for delete
  using (auth.uid() = user_id);

-- 9. QUESTION ATTEMPTS / QUIZ SUBMISSIONS
create table if not exists public.learn_question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  course_id text references public.learn_courses(id) on delete cascade not null,
  question_id text references public.learn_questions(id) on delete cascade not null,
  submitted_answer text not null,
  is_correct boolean not null,
  points_awarded int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_learn_attempts_user_course on public.learn_question_attempts(user_id, course_id);
create index if not exists idx_learn_attempts_question on public.learn_question_attempts(question_id);

alter table public.learn_question_attempts enable row level security;

create policy "Users can read own question attempts"
  on public.learn_question_attempts for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert own question attempts"
  on public.learn_question_attempts for insert
  with check (auth.uid() = user_id);
