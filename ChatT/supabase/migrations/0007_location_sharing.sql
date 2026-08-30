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
