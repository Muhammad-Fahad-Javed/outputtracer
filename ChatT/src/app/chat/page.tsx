"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthUser } from "@/hooks/useAuthUser";
import { usePresence } from "@/hooks/usePresence";
import { useMessages } from "@/hooks/useMessages";
import { createClient } from "@/lib/supabase-browser";
import { uploadChatPhoto } from "@/lib/photo-upload";
import { uploadChatAudio } from "@/lib/audio-upload";
import { cachePhoto } from "@/lib/photo-cache";
import { ChatHeader } from "@/components/ChatHeader";
import { MessageBubble } from "@/components/MessageBubble";
import { MessageInput } from "@/components/MessageInput";
import { SharedNotesPanel } from "@/components/SharedNotesPanel";
import { DayDivider, EmptyChatState, PhotoLightbox, ChatLoadingState, TypingIndicator } from "@/components/ChatExtras";
import { useTheme } from "@/hooks/useTheme";
import { useLiveLocation } from "@/hooks/useLiveLocation";
import { formatDayDivider } from "@/lib/format";
import { Navigation } from "lucide-react";
import type { Message } from "@/types/database";

export default function ChatPage() {
  const supabase = createClient();
  const router = import("next/navigation").then(mod => mod.useRouter());
  const { loading: authLoading, userId, partner, conversationId, hasPair } = useAuthUser();
  const { isPartnerOnline, lastSeen, isPartnerTyping, setTyping } = usePresence(conversationId, userId, partner?.id ?? null);
  const {
    messages,
    loading: messagesLoading,
    loadingOlder,
    hasMore,
    loadOlder,
    sendTextMessage,
    sendImageMessage,
    sendAudioMessage,
    sendLocationMessage,
    markRead,
    toggleReaction,
    deleteMessage,
  } = useMessages(conversationId, userId);

  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const { wallpaperUrl } = useTheme();
  const { isSharing: isLiveLocationActive, partnerLocation, toggleLiveLocation } = useLiveLocation(conversationId, userId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const previousScrollHeight = useRef<number>(0);
  const markedReadIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && !hasPair) {
      router.then(r => r.replace("/pair"));
    }
  }, [authLoading, hasPair, router]);

  // Load which photo messages the current user has already saved.
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("saved_photos")
      .select("message_id")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (data) setSavedIds(new Set(data.map((r) => r.message_id)));
      });
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to newest message when the list grows (unless the user has
  // scrolled up to read history — a simple heuristic based on scroll position).
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    
    // If we just loaded older messages, the height increased. We must restore scroll offset.
    if (loadingOlder) {
      previousScrollHeight.current = container.scrollHeight;
      return;
    }
    
    if (previousScrollHeight.current > 0 && messages.length > 0 && container.scrollHeight > previousScrollHeight.current) {
      // It was a pagination load! Restore the relative scroll position.
      const heightDiff = container.scrollHeight - previousScrollHeight.current;
      if (container.scrollTop < 50) {
        container.scrollTop = heightDiff;
      }
      previousScrollHeight.current = 0;
      return;
    }

    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    previousScrollHeight.current = 0;
  }, [messages.length, isPartnerTyping, loadingOlder]);

  // Mark incoming unread messages as read once they're visible in this view.
  useEffect(() => {
    if (!userId) return;
    const unreadIncoming = messages
      .filter((m) => m.receiver_id === userId && !m.read_at && !markedReadIds.current.has(m.id))
      .map((m) => m.id);
    if (unreadIncoming.length > 0) {
      unreadIncoming.forEach(id => markedReadIds.current.add(id));
      markRead(unreadIncoming);
    }
  }, [messages, userId, markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSavePhoto(messageId: string) {
    if (!userId) return;
    if (savedIds.has(messageId)) {
      await supabase.from("saved_photos").delete().eq("user_id", userId).eq("message_id", messageId);
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    } else {
      await supabase.from("saved_photos").insert({ user_id: userId, message_id: messageId });
      setSavedIds((prev) => new Set(prev).add(messageId));
    }
  }

  async function handleSendText(text: string, expiresInSeconds?: number) {
    if (!partner) return;
    await sendTextMessage(text, partner.id, replyingToMessage?.id, expiresInSeconds);
    setReplyingToMessage(null);
  }

  async function handleSendPhoto(file: File, expiresInSeconds?: number) {
    if (!partner || !conversationId || !userId) return;
    const path = await uploadChatPhoto(file, conversationId, userId);
    // Cache the sender's own photo locally so it survives Supabase deletion
    // by the receiver. We cache the original file blob before compression,
    // which is acceptable because the upload function already compresses it.
    try {
      await cachePhoto(path, file);
    } catch {
      // Non-critical — photo will still be viewable via Supabase until deleted
    }
    await sendImageMessage(path, partner.id, expiresInSeconds);
  }

  async function handleSendAudio(blob: Blob, expiresInSeconds?: number) {
    if (!partner || !conversationId || !userId) return;
    const path = await uploadChatAudio(blob, conversationId, userId);
    await sendAudioMessage(path, partner.id, replyingToMessage?.id, expiresInSeconds);
    setReplyingToMessage(null);
  }

  async function handleSendLocation(lat: number, lng: number, expiresInSeconds?: number) {
    if (!partner) return;
    await sendLocationMessage(lat, lng, partner.id, replyingToMessage?.id, expiresInSeconds);
    setReplyingToMessage(null);
  }

  const groupedByDay = useMemo(() => {
    const groups: { label: string; items: Message[] }[] = [];
    for (const message of messages) {
      const label = formatDayDivider(message.created_at);
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.label === label) {
        lastGroup.items.push(message);
      } else {
        groups.push({ label, items: [message] });
      }
    }
    return groups;
  }, [messages]);

  function handleScroll() {
    const container = scrollRef.current;
    if (!container || loadingOlder || !hasMore) return;
    if (container.scrollTop < 80) loadOlder();
  }

  if (authLoading) {
    return (
      <main className="flex h-screen items-center justify-center bg-background">
        <ChatLoadingState />
      </main>
    );
  }

  return (
    <main 
      className="flex h-screen flex-col bg-background relative overflow-hidden"
      style={wallpaperUrl ? {
        backgroundImage: `url(${wallpaperUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      } : {}}
    >
      {wallpaperUrl && <div className="absolute inset-0 bg-background/60 z-0 pointer-events-none" />}
      
      <div className="z-10 relative flex-none">
        <ChatHeader 
          partner={partner} 
          isPartnerOnline={isPartnerOnline} 
          lastSeen={lastSeen} 
          onOpenNotes={() => setIsNotesOpen(true)}
        />
        {partnerLocation && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${partnerLocation.lat},${partnerLocation.lng}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between bg-blue-500/90 px-4 py-2 text-sm font-semibold text-white backdrop-blur shadow-sm transition hover:bg-blue-600"
          >
            <div className="flex items-center gap-2">
              <Navigation className="h-4 w-4 animate-pulse" />
              {partner?.display_name} is sharing their live location
            </div>
            <span className="text-xs opacity-80 underline">View Map</span>
          </a>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="no-scrollbar flex-1 overflow-y-auto px-3 py-4 sm:px-6"
      >
        {messagesLoading ? (
          <ChatLoadingState />
        ) : messages.length === 0 ? (
          <EmptyChatState />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
            {loadingOlder && (
              <p className="pb-2 text-center text-xs text-muted">Loading earlier messages…</p>
            )}
            {groupedByDay.map((group) => (
              <div key={group.label}>
                <DayDivider label={group.label} />
                <div className="flex flex-col gap-1.5">
                  {group.items.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isOwn={message.sender_id === userId}
                      isSaved={savedIds.has(message.id)}
                      onSavePhoto={handleSavePhoto}
                      onOpenPhoto={setLightboxUrl}
                      onReply={setReplyingToMessage}
                      onReact={toggleReaction}
                      onDelete={deleteMessage}
                      repliedMessage={
                        message.reply_to_id
                          ? messages.find((m) => m.id === message.reply_to_id)
                          : null
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
            {isPartnerTyping && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="z-10 relative flex-none">
        <MessageInput 
          onSendText={handleSendText} 
          onSendPhoto={handleSendPhoto} 
          onSendAudio={handleSendAudio}
          onSendLocation={handleSendLocation}
          onStartLiveLocation={toggleLiveLocation}
          isLiveLocationActive={isLiveLocationActive}
          onTyping={setTyping}
          replyingToMessage={replyingToMessage}
          onCancelReply={() => setReplyingToMessage(null)}
          disabled={!partner} 
        />
      </div>

      {lightboxUrl && <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

      <SharedNotesPanel 
        isOpen={isNotesOpen} 
        onClose={() => setIsNotesOpen(false)} 
        conversationId={conversationId} 
        userId={userId} 
      />
    </main>
  );
}
