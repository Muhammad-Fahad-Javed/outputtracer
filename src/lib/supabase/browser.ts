"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
let pending: Promise<SupabaseClient | null> | null = null;

export function getSupabaseBrowser(): Promise<SupabaseClient | null> {
  if (client) return Promise.resolve(client);
  if (!pending) {
    pending = fetch("/api/config")
      .then((response) => response.json())
      .then((data: { configured?: boolean; url?: string; anonKey?: string }) => {
        if (!data.configured || !data.url || !data.anonKey) return null;
        client = createBrowserClient(data.url, data.anonKey);
        return client;
      })
      .catch(() => null);
  }
  return pending;
}
