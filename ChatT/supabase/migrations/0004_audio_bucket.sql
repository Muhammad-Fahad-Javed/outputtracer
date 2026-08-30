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
