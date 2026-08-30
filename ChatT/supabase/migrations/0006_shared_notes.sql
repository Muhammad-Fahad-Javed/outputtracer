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
