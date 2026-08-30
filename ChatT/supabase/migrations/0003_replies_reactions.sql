-- Add reply_to_id and reactions to messages table
ALTER TABLE public.messages
ADD COLUMN reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
ADD COLUMN reactions JSONB DEFAULT '{}'::jsonb;

-- Note: The existing RLS policies on `messages` (from 0002_policies.sql)
-- already cover UPDATE operations for conversation participants, which allows
-- users to add/remove reactions to any message in their conversation.
