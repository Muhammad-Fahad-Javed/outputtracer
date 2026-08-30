-- ============================================================================
-- storage_policies.sql
-- Run this AFTER creating a PRIVATE bucket named 'chat-photos' in the
-- Supabase Dashboard (Storage > New bucket > uncheck "Public bucket").
--
-- Object paths are expected in the form:
--   <conversation_id>/<sender_id>/<uuid>.<ext>
-- which lets policies check the sender segment of the path directly.
-- ============================================================================

-- Enable RLS on storage.objects is on by default in Supabase; these policies
-- scope access to the 'chat-photos' bucket specifically.

create policy "chat_photos_select_conversation_participants"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-photos'
    and public.is_authorized_user()
    and exists (
      select 1
      from public.messages m
      where m.attachment_path = storage.objects.name
        and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
    )
  );

create policy "chat_photos_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-photos'
    and public.is_authorized_user()
    -- path must be "<conversation_id>/<sender_id>/filename"
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- No update/delete policy: uploaded photos are immutable and permanent,
-- matching the "photos must not disappear" requirement. Add a delete
-- policy deliberately if you want users to be able to remove photos.
