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
