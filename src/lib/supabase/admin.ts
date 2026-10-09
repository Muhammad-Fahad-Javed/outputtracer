import { createClient } from "@supabase/supabase-js";
import { supabaseServiceKey, supabaseUrl } from "./env";

export function createAdminClient() {
  const url = supabaseUrl();
  const key = supabaseServiceKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
