"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  MessageSquare,
  Users,
  Send,
  User,
  ArrowLeft,
  AlertCircle,
  ShieldAlert,
} from "lucide-react";
import type { ClassroomMessage } from "@/lib/classroom/communicationTypes";
import type { ConversationSummary } from "@/lib/classroom/messagingService";

export default function ClassroomMessagesPage() {
  const params = useParams();
  const classId = params.classId as string;

  const [loadingConversations, setLoadingConversations] = useState(true);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | undefined>(undefined);
  const [selectedPartnerName, setSelectedPartnerName] = useState<string>("Classroom Group Chat");
  const [isGroupChat, setIsGroupChat] = useState(true);

  const [messages, setMessages] = useState<ClassroomMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputContent, setInputContent] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Fetch conversations list
  const loadConversations = async () => {
    try {
      const res = await fetch(`/api/classroom/${classId}/messages/conversations`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setConversations(data.conversations || []);
        }
      }
    } catch {
      // ignore network errors
    } finally {
      setLoadingConversations(false);
    }
  };

  // 2. Fetch messages for active thread
  const loadMessages = async (partnerId?: string) => {
    try {
      const url = partnerId
        ? `/api/classroom/${classId}/messages?recipientId=${partnerId}&limit=50`
        : `/api/classroom/${classId}/messages?limit=50`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setMessages(data.messages || []);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingMessages(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadConversations();
    loadMessages();
  }, [classId]);

  // Polling for updates every 10 seconds only when tab is visible
  useEffect(() => {
    const handlePoll = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      loadMessages(selectedPartnerId);
    };

    const interval = setInterval(handlePoll, 10000);
    return () => clearInterval(interval);
  }, [classId, selectedPartnerId]);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSelectConversation = (conv: ConversationSummary) => {
    setIsGroupChat(conv.isGroup);
    setSelectedPartnerId(conv.partnerId);
    setSelectedPartnerName(conv.partnerName || (conv.isGroup ? "Classroom Group Chat" : "Discussion"));
    setLoadingMessages(true);
    loadMessages(conv.partnerId);

    // If DM and has unread, mark read
    if (conv.partnerId) {
      fetch(`/api/classroom/${classId}/messages/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: conv.partnerId }),
      });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = inputContent.trim();
    if (!content || sending) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/classroom/${classId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: selectedPartnerId,
          content,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to send message.");
      } else {
        setInputContent("");
        if (data.message) {
          setMessages((prev) => [...prev, data.message]);
        }
        loadConversations();
      }
    } catch {
      setError("Network error sending message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA]">
      <Header />

      <main className="flex-1 pb-12 pt-6">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          {/* Top navigation */}
          <div className="mb-4 flex items-center justify-between">
            <Link
              href={`/classroom/${classId}`}
              className="inline-flex items-center gap-1.5 text-xs text-[#666666] hover:text-black transition-colors"
            >
              <ArrowLeft size={13} /> Back to Classroom
            </Link>
            <span className="font-mono text-[11px] text-[#888888]">
              OutputTracer Classroom Chat &bull; Encrypted in Transit
            </span>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Messaging Main Container */}
          <div className="grid grid-cols-1 md:grid-cols-3 rounded-2xl border border-[#EAEAEA] bg-white shadow-xs overflow-hidden min-h-[620px]">
            {/* Left panel: Channels List */}
            <div className="border-r border-[#F0F0F0] flex flex-col bg-[#FBFBFB]">
              <div className="p-4 border-b border-[#F0F0F0] flex items-center justify-between bg-white">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#007ACC]" />
                  <h2 className="font-bold text-xs uppercase tracking-wider text-black">
                    Channels & Chats
                  </h2>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[#F0F0F0]">
                {loadingConversations ? (
                  <div className="p-8 text-center text-xs text-[#888888]">Loading conversations...</div>
                ) : conversations.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#888888]">No conversations found.</div>
                ) : (
                  conversations.map((c, idx) => {
                    const isSelected = c.isGroup
                      ? isGroupChat
                      : selectedPartnerId === c.partnerId;

                    return (
                      <button
                        key={idx}
                        onClick={() => handleSelectConversation(c)}
                        className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 ${
                          isSelected
                            ? "bg-white border-l-3 border-black text-black font-semibold shadow-xs"
                            : "hover:bg-[#F2F2F2] text-[#555555]"
                        }`}
                      >
                        <div className="p-2 rounded-lg border border-[#DCDCDC] bg-white text-black mt-0.5">
                          {c.isGroup ? <Users className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-xs truncate text-black font-medium">
                              {c.partnerName}
                            </p>
                            {c.unreadCount > 0 && (
                              <span className="rounded-full bg-black px-1.5 py-0.2 text-[10px] font-bold text-white">
                                {c.unreadCount}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#777777] truncate mt-0.5">
                            {c.lastMessage}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right panel: Active Chat Thread */}
            <div className="md:col-span-2 flex flex-col bg-white">
              {/* Thread Header */}
              <div className="p-4 border-b border-[#F0F0F0] flex items-center justify-between bg-white">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-md border border-[#DCDCDC] bg-[#F9F9F9] text-black">
                    {isGroupChat ? <Users className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-black">{selectedPartnerName}</h3>
                    <p className="text-[11px] text-[#777777]">
                      {isGroupChat
                        ? "Visible to enrolled students & verified teachers in this classroom"
                        : "Private 1-on-1 discussion & academic guidance"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Messages Scroll Area */}
              <div className="flex-1 p-5 overflow-y-auto space-y-3.5 bg-[#FAFAFA]">
                {loadingMessages ? (
                  <div className="py-16 text-center text-xs text-[#888888]">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="py-20 text-center text-xs text-[#888888]">
                    <MessageSquare className="w-8 h-8 text-[#CCCCCC] mx-auto mb-2" />
                    No messages in this channel yet. Start the conversation!
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className="flex flex-col space-y-1">
                      <div className="flex items-center gap-2 text-[11px] text-[#888888]">
                        <span className="font-semibold text-black">{m.senderName || "Member"}</span>
                        <span>&bull;</span>
                        <span>
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="rounded-xl border border-[#EAEAEA] bg-white p-3.5 max-w-xl text-xs text-black shadow-2xs leading-relaxed whitespace-pre-wrap">
                        {m.content}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Form */}
              <form onSubmit={handleSendMessage} className="p-3.5 border-t border-[#F0F0F0] bg-white">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputContent}
                    onChange={(e) => setInputContent(e.target.value)}
                    placeholder={`Message ${selectedPartnerName}...`}
                    className="flex-1 rounded-[4px] border border-[#DCDCDC] px-3.5 py-2 text-xs text-black placeholder-[#999999] focus:border-black focus:outline-none transition-colors"
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    disabled={sending || !inputContent.trim()}
                    className="inline-flex items-center gap-1.5 rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-[#333333] disabled:opacity-50 transition-colors"
                  >
                    <Send size={12} />
                    <span>Send</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
