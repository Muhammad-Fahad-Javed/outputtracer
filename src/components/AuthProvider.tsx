"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {removeBrowserPush} from "@/lib/pushClient";
import type { User, Session } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  signOut: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const supabase = await getSupabaseBrowser();
      if (!supabase) { setUser(null); return; }
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    // Promptly replace an older worker that may still hold cached private pages.
    // New subscriptions remain opt-in; this updates only an existing registration.
    if(process.env.NODE_ENV==='production'&&'serviceWorker' in navigator){
      void navigator.serviceWorker.getRegistration('/').then(reg=>reg?.update()).catch(()=>{});
    }

    void (async () => {
      const supabase = await getSupabaseBrowser();
      if (!supabase) {
        setIsLoading(false);
        return;
      }

      // Initial session
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setIsLoading(false);

      // Listen for auth changes (sign in, sign out, token refresh)
      let previousUserId=initialSession?.user.id;
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
        if(previousUserId&&previousUserId!==newSession?.user.id){
          // Invalidate this device on account switches, including logout in another tab.
          // Unsubscribed endpoints are retired by the outbox's expired-device cleanup.
          void navigator.serviceWorker?.getRegistration('/').then(r=>r?.pushManager?.getSubscription()).then(s=>s?.unsubscribe()).catch(()=>{});
        }
        previousUserId=newSession?.user.id;
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setIsLoading(false);
      });
      unsubscribe = () => subscription.unsubscribe();
    })();

    return () => { unsubscribe?.(); };
  }, []);

  const signOut = async () => {
    const supabase = await getSupabaseBrowser();
    try{await removeBrowserPush();}catch{const r=await navigator.serviceWorker?.getRegistration("/");const sub=await r?.pushManager?.getSubscription();await sub?.unsubscribe();}
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
