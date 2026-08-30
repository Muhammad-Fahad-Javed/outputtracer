"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/**
 * Browser client. Uses only the public URL + anon key — both are safe to
 * expose to the client. All real authorization happens via Postgres Row
 * Level Security policies (see supabase/migrations/0002_policies.sql),
 * not via anything in this file.
 */
let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return browserClient;
}
