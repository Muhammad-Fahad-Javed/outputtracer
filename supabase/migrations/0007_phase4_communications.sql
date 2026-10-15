-- ==============================================================================
-- OutputTracer: Phase 4 — Communication, Moderation, & Notifications
-- (0007_phase4_communications.sql)
-- NOT applied to live DB. Awaiting explicit user approval.
-- ==============================================================================

-- 1. CLASSROOM ANNOUNCEMENTS
-- Official instructor broadcasts to all enrolled members in the classroom.
create table if not exists public.classroom_announcements (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  content text not null check (char_length(trim(content)) between 1 and 10000),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_announcements_classroom on public.classroom_announcements(classroom_id, created_at desc);
create index if not exists idx_announcements_pinned on public.classroom_announcements(classroom_id, is_pinned);

alter table public.classroom_announcements enable row level security;

-- Enrolled members and admins can read announcements
create policy "Enrolled members can view classroom announcements"
  on public.classroom_announcements for select
  using (
    public.is_admin() or
    exists (
      select 1 from public.classrooms c
      where c.id = classroom_announcements.classroom_id and c.teacher_id = auth.uid()
    ) or
    exists (
      select 1 from public.classroom_members cm
      where cm.classroom_id = classroom_announcements.classroom_id and cm.user_id = auth.uid()
    )
  );

-- Only verified teachers managing this classroom (or admin) can create announcements
create policy "Instructors can create announcements"
  on public.classroom_announcements for insert
  with check (
    public.is_admin() or
    exists (
      select 1 from public.classrooms c
      where c.id = classroom_announcements.classroom_id and c.teacher_id = auth.uid()
    )
  );

-- Only instructor or admin can update/delete announcements
create policy "Instructors can update announcements"
  on public.classroom_announcements for update
  using (
    public.is_admin() or
    exists (
      select 1 from public.classrooms c
      where c.id = classroom_announcements.classroom_id and c.teacher_id = auth.uid()
    )
  );

create policy "Instructors can delete announcements"
  on public.classroom_announcements for delete
  using (
    public.is_admin() or
    exists (
      select 1 from public.classrooms c
      where c.id = classroom_announcements.classroom_id and c.teacher_id = auth.uid()
    )
  );


-- 2. ASSIGNMENT & GROUP DISCUSSION POSTS (FORUM THREADS)
-- Contexts:
-- - "assignment": public Q&A visible to enrolled classroom members
-- - "group": private workspace collaboration visible only to group members and the teacher
create table if not exists public.classroom_discussions (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  assignment_id uuid references public.classroom_assignments(id) on delete cascade,
  group_id uuid references public.classroom_groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.classroom_discussions(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 5000),
  is_hidden_by_moderator boolean not null default false,
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint check_discussion_context check (
    (assignment_id is not null and group_id is null) or
    (assignment_id is null and group_id is not null) or
    (assignment_id is not null and group_id is not null)
  )
);

create index if not exists idx_discussions_assignment on public.classroom_discussions(assignment_id, created_at asc);
create index if not exists idx_discussions_group on public.classroom_discussions(group_id, created_at asc);
create index if not exists idx_discussions_parent on public.classroom_discussions(parent_id);

alter table public.classroom_discussions enable row level security;

-- Read rules:
-- Assignment discussions: readable by any enrolled classroom member (unless hidden by moderator).
-- Group discussions: readable ONLY by members of that group or the classroom teacher.
create policy "Members can view permitted discussions"
  on public.classroom_discussions for select
  using (
    public.is_admin() or
    exists (
      select 1 from public.classrooms c
      where c.id = classroom_discussions.classroom_id and c.teacher_id = auth.uid()
    ) or
    (
      -- Assignment-level discussion (not group-specific)
      group_id is null and
      is_hidden_by_moderator = false and
      exists (
        select 1 from public.classroom_members cm
        where cm.classroom_id = classroom_discussions.classroom_id and cm.user_id = auth.uid()
      )
    ) or
    (
      -- Group-specific discussion: must be a member of this specific group
      group_id is not null and
      is_hidden_by_moderator = false and
      exists (
        select 1 from public.classroom_group_members cgm
        where cgm.group_id = classroom_discussions.group_id and cgm.user_id = auth.uid()
      )
    )
  );

-- Insert rules: author must be auth.uid(), must belong to the classroom/group
create policy "Members can post in permitted discussions"
  on public.classroom_discussions for insert
  with check (
    auth.uid() = author_id and
    (
      public.is_admin() or
      exists (
        select 1 from public.classrooms c
        where c.id = classroom_discussions.classroom_id and c.teacher_id = auth.uid()
      ) or
      (
        group_id is null and
        exists (
          select 1 from public.classroom_members cm
          where cm.classroom_id = classroom_discussions.classroom_id and cm.user_id = auth.uid()
        )
      ) or
      (
        group_id is not null and
        exists (
          select 1 from public.classroom_group_members cgm
          where cgm.group_id = classroom_discussions.group_id and cgm.user_id = auth.uid()
        )
      )
    )
  );

-- Teachers and authors can update posts (teachers for moderation; authors for edits)
create policy "Authors and instructors can update discussions"
  on public.classroom_discussions for update
  using (
    public.is_admin() or
    auth.uid() = author_id or
    exists (
      select 1 from public.classrooms c
      where c.id = classroom_discussions.classroom_id and c.teacher_id = auth.uid()
    )
  );


-- 3. NOTIFICATIONS
-- Direct system/feedback/grade notifications delivered securely to a specific recipient.
create table if not exists public.classroom_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  type text not null check (type in ('grade', 'feedback', 'announcement', 'mention', 'deadline', 'system')),
  title text not null check (char_length(trim(title)) between 1 and 200),
  message text not null check (char_length(trim(message)) between 1 and 1000),
  link text check (link is null or char_length(trim(link)) <= 500),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient on public.classroom_notifications(recipient_id, is_read, created_at desc);

alter table public.classroom_notifications enable row level security;

-- Recipient reads only their own notifications
create policy "Users view own notifications"
  on public.classroom_notifications for select
  using (auth.uid() = recipient_id or public.is_admin());

-- Recipient can mark their own notifications as read
create policy "Users update own notifications"
  on public.classroom_notifications for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);


-- 4. MODERATION & ABUSE REPORTS
-- Structured reporting system for classroom discussions or comments.
create table if not exists public.classroom_abuse_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  target_type text not null check (target_type in ('discussion', 'comment', 'announcement')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate_content', 'academic_dishonesty', 'other')),
  details text check (details is null or char_length(trim(details)) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  moderated_by uuid references public.profiles(id) on delete set null,
  moderator_notes text check (moderator_notes is null or char_length(trim(moderator_notes)) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_abuse_reports_classroom on public.classroom_abuse_reports(classroom_id, status);
create index if not exists idx_abuse_reports_status on public.classroom_abuse_reports(status);

alter table public.classroom_abuse_reports enable row level security;

-- Reporters can see reports they submitted; teachers and admins see all reports for the classroom
create policy "Reporters and teachers view abuse reports"
  on public.classroom_abuse_reports for select
  using (
    public.is_admin() or
    auth.uid() = reporter_id or
    exists (
      select 1 from public.classrooms c
      where c.id = classroom_abuse_reports.classroom_id and c.teacher_id = auth.uid()
    )
  );

-- Any enrolled classroom member can submit a report
create policy "Enrolled members can submit abuse reports"
  on public.classroom_abuse_reports for insert
  with check (
    auth.uid() = reporter_id and
    (
      public.is_admin() or
      exists (
        select 1 from public.classrooms c
        where c.id = classroom_abuse_reports.classroom_id and c.teacher_id = auth.uid()
      ) or
      exists (
        select 1 from public.classroom_members cm
        where cm.classroom_id = classroom_abuse_reports.classroom_id and cm.user_id = auth.uid()
      )
    )
  );

-- Teachers and admins can resolve or dismiss reports
create policy "Teachers and admins can update abuse reports"
  on public.classroom_abuse_reports for update
  using (
    public.is_admin() or
    exists (
      select 1 from public.classrooms c
      where c.id = classroom_abuse_reports.classroom_id and c.teacher_id = auth.uid()
    )
  );
