import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "./env";

export async function createClient() {
  // Access request state before checking configuration. A prebuilt release may
  // be compiled without server credentials; never cache its anonymous result.
  const cookieStore = await cookies();
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies. src/proxy.ts refreshes the session.
        }
      },
    },
  });
}
