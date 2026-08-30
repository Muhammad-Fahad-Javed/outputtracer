export type MessageType = "text" | "image" | "audio" | "location";

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  last_seen: string;
  is_online: boolean;
  created_at: string;
};

export type Conversation = {
  id: string;
  user_1_id: string;
  user_2_id: string;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  message_text: string | null;
  message_type: MessageType;
  attachment_path: string | null;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  reply_to_id: string | null;
  reactions: Record<string, string> | null;
  expires_in_seconds: number | null;
};

export type SavedPhoto = {
  id: string;
  user_id: string;
  message_id: string;
  created_at: string;
};

export type SharedNote = {
  id: string;
  conversation_id: string;
  created_by: string;
  title: string;
  content: string | null;
  is_todo: boolean;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type ConnectionCode = {
  id: string;
  code: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  used: boolean;
};

/**
 * Supabase Database generic shape, hand-written to match what
 * `supabase gen types typescript` would produce against the live schema in
 * supabase/migrations. In a real project, prefer generating this file
 * directly from the database so it never drifts from the actual schema:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 *
 * NOTE: these are declared with `type`, not `interface`. Supabase's
 * generated types always use `type`, and postgrest-js's conditional type
 * inference for .select()/.insert()/.update() does not resolve correctly
 * against `interface`-declared row shapes — it silently falls back to
 * `never`. Keep these as `type` aliases.
 */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; email: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      conversations: {
        Row: Conversation;
        Insert: Partial<Conversation> & { user_1_id: string; user_2_id: string };
        Update: Partial<Conversation>;
        Relationships: [];
      };
      messages: {
        Row: Message;
        Insert: Partial<Message> & {
          conversation_id: string;
          sender_id: string;
          receiver_id: string;
        };
        Update: Partial<Message>;
        Relationships: [];
      };
      saved_photos: {
        Row: SavedPhoto;
        Insert: Partial<SavedPhoto> & { user_id: string; message_id: string };
        Update: Partial<SavedPhoto>;
        Relationships: [];
      };
      connection_codes: {
        Row: ConnectionCode;
        Insert: Partial<ConnectionCode> & { code: string; user_id: string };
        Update: Partial<ConnectionCode>;
        Relationships: [];
      };
      shared_notes: {
        Row: SharedNote;
        Insert: Partial<SharedNote> & { conversation_id: string; created_by: string; title: string };
        Update: Partial<SharedNote>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      touch_last_seen: {
        Args: Record<string, never>;
        Returns: void;
      };
      set_online_status: {
        Args: { online: boolean };
        Returns: void;
      };
      is_conversation_participant: {
        Args: { conv_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
