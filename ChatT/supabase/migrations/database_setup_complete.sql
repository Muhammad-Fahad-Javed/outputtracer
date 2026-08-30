-- 0001_schema.sql
-- ============================================================================
-- 0001_schema.sql
-- Core schema for the multi-tenant couples chat application.
-- ============================================================================

-- Required for gen_random_uuid()
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- profiles: one row per auth.users account.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null default 'User',
  avatar_url text,
  last_seen timestamptz not null default now(),
  is_online boolean not null default false,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user is created via Supabase Auth.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- connection_codes: codes used by users to pair up
-- ----------------------------------------------------------------------------
create table if not exists public.connection_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  used boolean not null default false
);

-- ----------------------------------------------------------------------------
-- conversations: one conversation per couple.
-- ----------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_1_id uuid not null references public.profiles (id) on delete cascade,
  user_2_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint different_users check (user_1_id <> user_2_id)
);

create unique index if not exists idx_conversations_pair
  on public.conversations (least(user_1_id, user_2_id), greatest(user_1_id, user_2_id));

-- ----------------------------------------------------------------------------
-- messages
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  message_text text,
  message_type text not null default 'text' check (message_type in ('text', 'image')),
  attachment_path text, -- storage object path, not a public URL
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  constraint text_or_attachment check (
    (message_type = 'text' and message_text is not null and length(trim(message_text)) > 0)
    or (message_type = 'image' and attachment_path is not null)
  )
);

create index if not exists idx_messages_conversation_created
  on public.messages (conversation_id, created_at desc);

-- ----------------------------------------------------------------------------
-- saved_photos: per-user "Saved Photos / Memories" bookmarks
-- ----------------------------------------------------------------------------
create table if not exists public.saved_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);

-- ----------------------------------------------------------------------------
-- Presence heartbeat helper
-- ----------------------------------------------------------------------------
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set last_seen = now()
  where id = auth.uid();
$$;

create or replace function public.set_online_status(online boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set is_online = online,
      last_seen = case when online = false then now() else last_seen end
  where id = auth.uid();
$$;


-- 0002_policies.sql
-- ============================================================================
-- 0002_policies.sql
-- Row Level Security for the multi-tenant couples chat application.
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.saved_photos enable row level security;
alter table public.connection_codes enable row level security;

-- Force RLS even for the table owner (extra safety net).
alter table public.profiles force row level security;
alter table public.conversations force row level security;
alter table public.messages force row level security;
alter table public.saved_photos force row level security;
alter table public.connection_codes force row level security;

-- ----------------------------------------------------------------------------
-- Helper: is the given user id part of THE conversation?
-- ----------------------------------------------------------------------------
create or replace function public.is_conversation_participant(conv_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv_id
      and (c.user_1_id = auth.uid() or c.user_2_id = auth.uid())
  );
$$;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create policy "profiles_select_self_or_partner"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.conversations c
      where (c.user_1_id = auth.uid() and c.user_2_id = profiles.id)
         or (c.user_2_id = auth.uid() and c.user_1_id = profiles.id)
    )
  );

create policy "profiles_update_self_only"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- connection_codes
-- ----------------------------------------------------------------------------
create policy "connection_codes_select"
  on public.connection_codes for select
  to authenticated
  using (
    user_id = auth.uid()
    or (used = false and expires_at > now())
  );

create policy "connection_codes_insert"
  on public.connection_codes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "connection_codes_update"
  on public.connection_codes for update
  to authenticated
  using (true)
  with check (true);

-- ----------------------------------------------------------------------------
-- conversations
-- ----------------------------------------------------------------------------
create policy "conversations_select_participant_only"
  on public.conversations for select
  to authenticated
  using (user_1_id = auth.uid() or user_2_id = auth.uid());

create policy "conversations_insert_participant"
  on public.conversations for insert
  to authenticated
  with check (user_1_id = auth.uid() or user_2_id = auth.uid());

-- ----------------------------------------------------------------------------
-- messages
-- ----------------------------------------------------------------------------
create policy "messages_select_participant_only"
  on public.messages for select
  to authenticated
  using (
    public.is_conversation_participant(conversation_id)
    and (sender_id = auth.uid() or receiver_id = auth.uid())
  );

create policy "messages_insert_as_self_to_partner"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
    and receiver_id <> auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (
          (c.user_1_id = auth.uid() and c.user_2_id = receiver_id)
          or (c.user_2_id = auth.uid() and c.user_1_id = receiver_id)
        )
    )
  );

create policy "messages_update_receiver_status_only"
  on public.messages for update
  to authenticated
  using (
    receiver_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
  )
  with check (
    receiver_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
  );

create or replace function public.protect_message_immutable_fields()
returns trigger
language plpgsql
as $$
begin
  if new.message_text is distinct from old.message_text
     or new.message_type is distinct from old.message_type
     or new.attachment_path is distinct from old.attachment_path
     or new.sender_id is distinct from old.sender_id
     or new.receiver_id is distinct from old.receiver_id
     or new.conversation_id is distinct from old.conversation_id then
    raise exception 'Only delivered_at and read_at may be updated on a message';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_message_fields on public.messages;
create trigger trg_protect_message_fields
  before update on public.messages
  for each row execute function public.protect_message_immutable_fields();

-- ----------------------------------------------------------------------------
-- saved_photos
-- ----------------------------------------------------------------------------
create policy "saved_photos_select_own"
  on public.saved_photos for select
  to authenticated
  using (user_id = auth.uid());

create policy "saved_photos_insert_own"
  on public.saved_photos for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.message_type = 'image'
        and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
    )
  );

create policy "saved_photos_delete_own"
  on public.saved_photos for delete
  to authenticated
  using (user_id = auth.uid());


-- 0003_replies_reactions.sql
-- Add reply_to_id and reactions to messages table
ALTER TABLE public.messages
ADD COLUMN reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
ADD COLUMN reactions JSONB DEFAULT '{}'::jsonb;

-- Note: The existing RLS policies on `messages` (from 0002_policies.sql)
-- already cover UPDATE operations for conversation participants, which allows
-- users to add/remove reactions to any message in their conversation.


-- 0004_audio_bucket.sql
-- Create a new storage bucket for audio messages
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-audio', 'chat-audio', false)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies for the chat-audio bucket
-- (Same restrictive policies as the chat-photos bucket)

-- Allow users to insert audio if they are authenticated
CREATE POLICY "Allow authenticated users to upload audio" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'chat-audio');

-- Allow users to view audio if they are authenticated
CREATE POLICY "Allow authenticated users to read audio" 
ON storage.objects FOR SELECT 
TO authenticated 
USING (bucket_id = 'chat-audio');

-- Allow users to delete audio if they are authenticated (so receivers can delete them)
CREATE POLICY "Allow authenticated users to delete audio" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (bucket_id = 'chat-audio');


-- 0005_self_destruct.sql
-- Add expires_in_seconds column to messages table for self-destructing messages
ALTER TABLE public.messages
ADD COLUMN expires_in_seconds INTEGER DEFAULT NULL;

-- Allow users to delete their own messages or messages they have received
-- (This allows the receiver's client to trigger the deletion when the timer expires)
CREATE POLICY "Users can delete messages in their conversations"
ON public.messages FOR DELETE
TO authenticated
USING (
  conversation_id IN (
    SELECT id FROM public.conversations
    WHERE user_1_id = auth.uid() OR user_2_id = auth.uid()
  )
);


-- 0006_shared_notes.sql
-- Create shared_notes table for couples to collaborate on lists/notes
CREATE TABLE public.shared_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  is_todo BOOLEAN DEFAULT false,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies for shared_notes
ALTER TABLE public.shared_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view notes in their conversations"
ON public.shared_notes FOR SELECT
TO authenticated
USING (
  conversation_id IN (
    SELECT id FROM public.conversations
    WHERE user_1_id = auth.uid() OR user_2_id = auth.uid()
  )
);

CREATE POLICY "Users can insert notes in their conversations"
ON public.shared_notes FOR INSERT
TO authenticated
WITH CHECK (
  conversation_id IN (
    SELECT id FROM public.conversations
    WHERE user_1_id = auth.uid() OR user_2_id = auth.uid()
  )
);

CREATE POLICY "Users can update notes in their conversations"
ON public.shared_notes FOR UPDATE
TO authenticated
USING (
  conversation_id IN (
    SELECT id FROM public.conversations
    WHERE user_1_id = auth.uid() OR user_2_id = auth.uid()
  )
);

CREATE POLICY "Users can delete notes in their conversations"
ON public.shared_notes FOR DELETE
TO authenticated
USING (
  conversation_id IN (
    SELECT id FROM public.conversations
    WHERE user_1_id = auth.uid() OR user_2_id = auth.uid()
  )
);


-- 0007_location_sharing.sql
-- ============================================================================
-- 0007_location_sharing.sql
-- Drop old message_type constraint and allow new types (audio, location)
-- ============================================================================

-- Drop the existing constraints on the messages table
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS text_or_attachment;

-- Add updated constraint for message_type
ALTER TABLE public.messages 
  ADD CONSTRAINT messages_message_type_check 
  CHECK (message_type IN ('text', 'image', 'audio', 'location'));

-- Add updated constraint to ensure required fields based on type
ALTER TABLE public.messages 
  ADD CONSTRAINT text_or_attachment 
  CHECK (
    (message_type = 'text' AND message_text IS NOT NULL AND length(trim(message_text)) > 0)
    OR (message_type = 'image' AND attachment_path IS NOT NULL)
    OR (message_type = 'audio' AND attachment_path IS NOT NULL)
    OR (message_type = 'location' AND message_text IS NOT NULL) -- stores "lat,lng"
  );


-- 0008_audit_fixes.sql
-- 1. Fix Display Name in handle_new_auth_user
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Allow Senders to update reactions on their own messages (Fix Reaction RLS)
DROP POLICY IF EXISTS "messages_update_receiver_status_only" ON public.messages;

CREATE POLICY "messages_update_reactions_and_read_status" 
  ON public.messages 
  FOR UPDATE 
  TO authenticated 
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations 
      WHERE user_1_id = auth.uid() OR user_2_id = auth.uid()
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.conversations 
      WHERE user_1_id = auth.uid() OR user_2_id = auth.uid()
    )
  );


-- 3. Create RPC for safe Message Restoration (bypass RLS for restoring partner messages)
CREATE OR REPLACE FUNCTION public.restore_messages(messages jsonb)
RETURNS void AS $$
DECLARE
  msg record;
BEGIN
  -- We assume 'messages' is a JSON array of message objects.
  -- This runs as SECURITY DEFINER, effectively bypassing RLS to allow inserting partner's old messages
  -- from a backup.
  FOR msg IN SELECT * FROM jsonb_populate_recordset(null::public.messages, messages)
  LOOP
    -- Simple upsert by ID. If message exists, it updates it, otherwise it inserts.
    INSERT INTO public.messages (
      id, created_at, conversation_id, sender_id, receiver_id, message_type, 
      message_text, attachment_path, read_at, delivered_at, reactions, 
      reply_to_id, expires_in_seconds
    )
    VALUES (
      msg.id, msg.created_at, msg.conversation_id, msg.sender_id, msg.receiver_id, msg.message_type, 
      msg.message_text, msg.attachment_path, msg.read_at, msg.delivered_at, msg.reactions, 
      msg.reply_to_id, msg.expires_in_seconds
    )
    ON CONFLICT (id) DO UPDATE SET
      message_text = EXCLUDED.message_text,
      attachment_path = EXCLUDED.attachment_path,
      read_at = EXCLUDED.read_at,
      delivered_at = EXCLUDED.delivered_at,
      reactions = EXCLUDED.reactions;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
