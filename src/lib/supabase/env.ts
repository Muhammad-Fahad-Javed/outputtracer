export function supabaseUrl(): string {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

export function supabaseAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
}

export function supabaseServiceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function isAuthConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

export function isCloudConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey() && supabaseServiceKey());
}

export function missingCloudEnv(): string[] {
  const missing: string[] = [];
  if (!supabaseUrl()) missing.push("SUPABASE_URL");
  if (!supabaseAnonKey()) missing.push("SUPABASE_ANON_KEY");
  if (!supabaseServiceKey()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return missing;
}
