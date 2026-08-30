import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * ADMIN CLIENT — uses the SERVICE ROLE key and bypasses Row Level Security
 * entirely.
 *
 * The `server-only` import above makes it a build error to accidentally
 * import this file from a Client Component.
 *
 * This client must only be used for trusted, server-initiated maintenance
 * operations, such as the one-time user seeding script
 * (scripts/seed-users.ts). It must NEVER be used to serve a request on
 * behalf of an end user, since doing so would bypass every RLS policy
 * that enforces the two-user restriction.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "The admin client should only be constructed in trusted server-side scripts."
    );
  }

  return createSupabaseClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
