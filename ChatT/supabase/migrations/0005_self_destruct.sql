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
