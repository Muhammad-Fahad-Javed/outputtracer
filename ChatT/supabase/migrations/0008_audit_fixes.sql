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
