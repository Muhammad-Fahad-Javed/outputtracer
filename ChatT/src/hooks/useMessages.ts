"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { deriveKey, encryptMessage, decryptMessage, getStoredPassphrase } from "@/lib/crypto";
import type { Message } from "@/types/database";

const PAGE_SIZE = 30;

export function useMessages(conversationId: string | null, userId: string | null) {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const oldestLoadedAt = useRef<string | null>(null);

  // Helper: decrypt message_text fields if a passphrase is set
  const decryptMessages = useCallback(async (msgs: Message[]): Promise<Message[]> => {
    const passphrase = getStoredPassphrase();
    if (!passphrase) return msgs;
    const key = await deriveKey(passphrase);
    return Promise.all(
      msgs.map(async (m) => {
        if (m.message_text && (m.message_type === "text" || m.message_type === "location")) {
          const decrypted = await decryptMessage(m.message_text, key);
          return { ...m, message_text: decrypted };
        }
        return m;
      })
    );
  }, []);

  // Initial load: most recent page of messages.
  useEffect(() => {
    if (!conversationId) return;
    const activeConversationId = conversationId;
    let cancelled = false;

    async function loadInitial() {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeConversationId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (cancelled) return;

      if (fetchError) {
        setError("Couldn't load messages. Check your connection and try again.");
        setLoading(false);
        return;
      }

      const ordered = [...(data ?? [])].reverse();
      const decrypted = await decryptMessages(ordered);
      if (cancelled) return;
      setMessages(decrypted);
      oldestLoadedAt.current = ordered[0]?.created_at ?? null;
      setHasMore((data ?? []).length === PAGE_SIZE);
      setLoading(false);
    }

    loadInitial();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Realtime subscription for new messages + status updates.
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          decryptMessages([newMsg]).then((decrypted) => {
            setMessages((prev) => {
              if (prev.some((m) => m.id === decrypted[0].id)) return prev;
              return [...prev, decrypted[0]];
            });
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedMsg = payload.new as Message;
          decryptMessages([updatedMsg]).then((decrypted) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === decrypted[0].id ? decrypted[0] : m))
            );
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const deletedId = payload.old.id;
          setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || !oldestLoadedAt.current || loadingOlder || !hasMore) return;
    setLoadingOlder(true);

    let cancelled = false;
    const { data, error: fetchError } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .lte("created_at", oldestLoadedAt.current) // Use lte to avoid skipping exact timestamp collisions
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (!fetchError && data) {
      if (cancelled) return;
      // Filter out messages we already have to handle the `lte` overlap
      const newMessages = data.filter((m) => !messages.some((existing) => existing.id === m.id));
      const ordered = [...newMessages].reverse();
      const decrypted = await decryptMessages(ordered);
      setMessages((prev) => {
        // Prevent stale state overlap
        const filteredPrev = prev.filter((p) => !decrypted.some((d) => d.id === p.id));
        return [...decrypted, ...filteredPrev];
      });
      if (ordered.length > 0) {
        oldestLoadedAt.current = ordered[0]?.created_at ?? oldestLoadedAt.current;
      }
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoadingOlder(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, hasMore, loadingOlder]);

  const sendTextMessage = useCallback(
    async (text: string, receiverId: string, replyToId?: string, expiresInSeconds?: number) => {
      if (!conversationId || !userId || !text.trim()) return;

      let messageText = text.trim();
      const passphrase = getStoredPassphrase();
      if (passphrase) {
        const key = await deriveKey(passphrase);
        messageText = await encryptMessage(messageText, key);
      }

      const { error: sendError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        receiver_id: receiverId,
        message_text: messageText,
        message_type: "text",
        reply_to_id: replyToId || null,
        expires_in_seconds: expiresInSeconds || null,
      });
      if (sendError) {
        setError("Message failed to send. Tap to retry.");
      }
    },
    [conversationId, userId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const sendImageMessage = useCallback(
    async (attachmentPath: string, receiverId: string, expiresInSeconds?: number) => {
      if (!conversationId || !userId) return;
      const { error: sendError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        receiver_id: receiverId,
        message_type: "image",
        attachment_path: attachmentPath,
        expires_in_seconds: expiresInSeconds || null,
      });
      if (sendError) {
        setError("Photo failed to send. Please try again.");
      }
    },
    [conversationId, userId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const sendAudioMessage = useCallback(
    async (attachmentPath: string, receiverId: string, replyToId?: string, expiresInSeconds?: number) => {
      if (!conversationId || !userId) return;
      const { error: sendError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        receiver_id: receiverId,
        message_type: "audio",
        attachment_path: attachmentPath,
        reply_to_id: replyToId || null,
        expires_in_seconds: expiresInSeconds || null,
      });
      if (sendError) {
        setError("Audio failed to send. Please try again.");
      }
    },
    [conversationId, userId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const sendLocationMessage = useCallback(
    async (lat: number, lng: number, receiverId: string, replyToId?: string, expiresInSeconds?: number) => {
      if (!conversationId || !userId) return;

      let messageText = `${lat},${lng}`;
      const passphrase = getStoredPassphrase();
      if (passphrase) {
        const key = await deriveKey(passphrase);
        messageText = await encryptMessage(messageText, key);
      }

      const { error: sendError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        receiver_id: receiverId,
        message_type: "location",
        message_text: messageText,
        reply_to_id: replyToId || null,
        expires_in_seconds: expiresInSeconds || null,
      });
      if (sendError) {
        setError("Location failed to send. Please try again.");
      }
    },
    [conversationId, userId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const markRead = useCallback(
    async (messageIds: string[]) => {
      if (messageIds.length === 0) return;
      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString(), delivered_at: new Date().toISOString() })
        .in("id", messageIds)
        .is("read_at", null);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const toggleReaction = useCallback(
    async (message: Message, emoji: string) => {
      if (!userId) return;
      const reactions = message.reactions ? { ...message.reactions } : {};
      
      // If this user already reacted with this exact emoji, remove it.
      // We store reactions as { [userId]: emoji } so each user gets 1 reaction per message.
      if (reactions[userId] === emoji) {
        delete reactions[userId];
      } else {
        reactions[userId] = emoji;
      }

      // Optimistic UI update could go here, but we rely on realtime subscription
      await supabase
        .from("messages")
        .update({ reactions })
        .eq("id", message.id);
    },
    [userId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      await supabase.from("messages").delete().eq("id", messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return {
    messages,
    loading,
    loadingOlder,
    hasMore,
    error,
    loadOlder,
    sendTextMessage,
    sendImageMessage,
    sendAudioMessage,
    sendLocationMessage,
    markRead,
    toggleReaction,
    deleteMessage,
  };
}
