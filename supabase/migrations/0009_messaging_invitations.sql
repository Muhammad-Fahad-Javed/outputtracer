-- ==============================================================================
-- OutputTracer: Phase 5 — Private Messaging & Invitation Tokens
-- (0009_messaging_invitations.sql)
-- NOT applied to live DB. Awaiting explicit user approval.
-- ==============================================================================

-- 1. PRIVATE MESSAGING
-- Supports teacher-student DMs and classroom-wide group messages.
create table if not exists public.classroom_messages (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 5000),
  is_group_message boolean not null default false,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_classroom_group
  on public.classroom_messages(classroom_id, created_at desc)
  where is_group_message = true;

create index if not exists idx_messages_dm
  on public.classroom_messages(classroom_id, sender_id, recipient_id, created_at desc)
  where is_group_message = false;

create index if not exists idx_messages_recipient
  on public.classroom_messages(recipient_id, is_read, created_at desc);

alter table public.classroom_messages enable row level security;

-- Users can see messages they sent, received, or (if group) where they are enrolled
create policy "Users can view their own messages"
  on public.classroom_messages for select
  using (
    public.is_admin() or
    sender_id = auth.uid() or
    recipient_id = auth.uid() or
    (
      is_group_message = true and
      (
        exists (
          select 1 from public.classroom_members cm
          where cm.classroom_id = classroom_messages.classroom_id and cm.user_id = auth.uid()
        ) or
        exists (
          select 1 from public.classrooms c
          where c.id = classroom_messages.classroom_id and c.teacher_id = auth.uid()
        )
      )
    )
  );

-- Teachers can send DMs to any member. Students can only send group messages.
create policy "Authorized users can send messages"
  on public.classroom_messages for insert
  with check (
    sender_id = auth.uid() and
    (
      -- Teachers can send any message type in their classroom
      exists (
        select 1 from public.classrooms c
        where c.id = classroom_messages.classroom_id and c.teacher_id = auth.uid()
      )
      or
      -- Students can send group messages or private DMs to the classroom instructor
      (
        exists (
          select 1 from public.classroom_members cm
          where cm.classroom_id = classroom_messages.classroom_id and cm.user_id = auth.uid()
        )
        and
        (
          is_group_message = true
          or
          exists (
            select 1 from public.classrooms c
            where c.id = classroom_messages.classroom_id and c.teacher_id = classroom_messages.recipient_id
          )
        )
      )
    )
  );


-- 2. EMAIL INVITATION TOKENS
-- Secure, expiring, single-use tokens for classroom invitations.
create table if not exists public.classroom_invitations (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  invitee_email text not null check (char_length(trim(invitee_email)) between 5 and 254),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  accepted_by uuid references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invitations_token
  on public.classroom_invitations(token) where status = 'pending';

create index if not exists idx_invitations_classroom
  on public.classroom_invitations(classroom_id, status);

create index if not exists idx_invitations_email
  on public.classroom_invitations(invitee_email, status);

-- Partial unique index: prevent duplicate pending invitations to same email in same classroom
create unique index if not exists idx_invitations_unique_pending
  on public.classroom_invitations(classroom_id, invitee_email) where status = 'pending';

alter table public.classroom_invitations enable row level security;

-- Teachers can view invitations for their classrooms, admins can view all
create policy "Teachers and admins can view invitations"
  on public.classroom_invitations for select
  using (
    public.is_admin() or
    exists (
      select 1 from public.classrooms c
      where c.id = classroom_invitations.classroom_id and c.teacher_id = auth.uid()
    ) or
    invitee_email in (
      select email from auth.users where id = auth.uid()
    )
  );

-- Only verified teachers for their own classrooms or admins can create invitations
create policy "Teachers can create invitations"
  on public.classroom_invitations for insert
  with check (
    invited_by = auth.uid() and
    (
      public.is_admin() or
      (
        public.is_verified_teacher(auth.uid()) and
        exists (
          select 1 from public.classrooms c
          where c.id = classroom_invitations.classroom_id and c.teacher_id = auth.uid()
        )
      )
    )
  );

-- Only the teacher or admin can update (revoke/accept) invitations
create policy "Teachers and admins can update invitations"
  on public.classroom_invitations for update
  using (
    public.is_admin() or
    exists (
      select 1 from public.classrooms c
      where c.id = classroom_invitations.classroom_id and c.teacher_id = auth.uid()
    )
    or accepted_by = auth.uid()
  );
