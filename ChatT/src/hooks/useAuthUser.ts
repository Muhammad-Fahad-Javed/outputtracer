"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { Profile } from "@/types/database";

interface AuthState {
  loading: boolean;
  userId: string | null;
  profile: Profile | null;
  partner: Profile | null;
  conversationId: string | null;
  hasPair: boolean;
  error: string | null;
}

/**
 * Loads the current user's profile and their partner's profile
 * for their conversation. Relies entirely on RLS to scope results.
 */
export function useAuthUser() {
  const supabase = createClient();
  const [state, setState] = useState<AuthState>({
    loading: true,
    userId: null,
    profile: null,
    partner: null,
    conversationId: null,
    hasPair: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) {
            setState((s) => ({
              ...s,
              loading: false,
              error: "No user found",
            }));
          }
          return;
        }

        // Load profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        // Look for a conversation (limit 1 to prevent PGRST116 crash if multiple somehow exist)
        const { data: conversation } = await supabase
          .from("conversations")
          .select("*")
          .or(`user_1_id.eq.${user.id},user_2_id.eq.${user.id}`)
          .limit(1)
          .maybeSingle();

        let partner: Profile | null = null;
        if (conversation) {
          const partnerId =
            conversation.user_1_id === user.id
              ? conversation.user_2_id
              : conversation.user_1_id;
          const { data: partnerProfile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", partnerId)
            .single();
          partner = partnerProfile ?? null;
        }

        if (!cancelled) {
          setState({
            loading: false,
            userId: user.id,
            profile: profile ?? null,
            partner,
            conversationId: conversation?.id ?? null,
            hasPair: Boolean(conversation),
            error: null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            loading: false,
            error: "Failed to load user data",
          }));
        }
      }
    }

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return state;
}