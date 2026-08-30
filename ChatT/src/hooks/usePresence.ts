"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

interface PresenceState {
  isPartnerOnline: boolean;
  lastSeen: string | null;
  isPartnerTyping: boolean;
}

export function usePresence(conversationId: string | null, userId: string | null, partnerId: string | null) {
  const supabase = createClient();
  const [state, setState] = useState<PresenceState>({ isPartnerOnline: false, lastSeen: null, isPartnerTyping: false });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!conversationId || !userId || !partnerId) return;

    const channel = supabase.channel(`presence:conversation:${conversationId}`, {
      config: { 
        presence: { key: userId },
        broadcast: { ack: false, self: false },
      },
    });
    channelRef.current = channel;

    let currentToken: string | null = null;
    supabase.auth.getSession().then(({ data: { session } }) => {
      currentToken = session?.access_token || null;
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState<{ online_at: string }>();
        const partnerOnline = Boolean(presenceState[partnerId]?.length);
        setState((s) => ({ ...s, isPartnerOnline: partnerOnline }));
      })
      .on("presence", { event: "join" }, ({ key }) => {
        if (key === partnerId) setState((s) => ({ ...s, isPartnerOnline: true }));
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        if (key === partnerId) {
          setState((s) => ({ ...s, isPartnerOnline: false, isPartnerTyping: false }));
          supabase.rpc("touch_last_seen").then(() => {});
        }
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.userId === partnerId) {
          setState((s) => ({ ...s, isPartnerTyping: payload.isTyping }));
          
          // Auto-clear typing indicator after 3 seconds of no updates
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          if (payload.isTyping) {
            typingTimeoutRef.current = setTimeout(() => {
              setState((s) => ({ ...s, isPartnerTyping: false }));
            }, 3000);
          }
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
          await supabase.rpc("set_online_status", { online: true });
        }
      });

    const handleBeforeUnload = () => {
      if (currentToken) {
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/set_online_status`;
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            "Authorization": `Bearer ${currentToken}`
          },
          body: JSON.stringify({ online: false }),
          keepalive: true
        }).catch(() => {});
      } else {
        supabase.rpc("set_online_status", { online: false });
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        channel.track({ online_at: new Date().toISOString() });
        supabase.rpc("set_online_status", { online: true });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
      supabase.rpc("set_online_status", { online: false });
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, userId, partnerId]);

  useEffect(() => {
    if (!partnerId) return;
    const activePartnerId = partnerId;
    let cancelled = false;

    async function poll() {
      const { data } = await supabase
        .from("profiles")
        .select("last_seen, is_online")
        .eq("id", activePartnerId)
        .single();
      if (!cancelled && data) {
        setState((s) => ({ ...s, lastSeen: data.last_seen }));
      }
    }

    poll();
    const interval = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  const setTyping = (isTyping: boolean) => {
    if (!channelRef.current || !userId) return;
    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { userId, isTyping },
    });
  };

  return { ...state, setTyping };
}
