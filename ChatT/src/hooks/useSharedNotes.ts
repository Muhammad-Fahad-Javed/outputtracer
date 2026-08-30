"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { SharedNote } from "@/types/database";

export function useSharedNotes(conversationId: string | null) {
  const supabase = createClient();
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    const { data } = await supabase
      .from("shared_notes")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false });
    
    if (data) setNotes(data as SharedNote[]);
    setLoading(false);
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchNotes();

    if (!conversationId) return;

    const channel = supabase
      .channel(`shared_notes:conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shared_notes",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          fetchNotes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, fetchNotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const addNote = async (title: string, content: string | null, isTodo: boolean, userId: string) => {
    if (!conversationId) return;
    await supabase.from("shared_notes").insert({
      conversation_id: conversationId,
      created_by: userId,
      title,
      content,
      is_todo: isTodo,
    });
  };

  const toggleTodo = async (noteId: string, isCompleted: boolean) => {
    await supabase
      .from("shared_notes")
      .update({ is_completed: isCompleted, updated_at: new Date().toISOString() })
      .eq("id", noteId);
  };

  const deleteNote = async (noteId: string) => {
    await supabase.from("shared_notes").delete().eq("id", noteId);
  };

  return {
    notes,
    loading,
    addNote,
    toggleTodo,
    deleteNote,
  };
}
