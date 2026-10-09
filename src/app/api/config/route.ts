import { NextResponse } from "next/server";
import { isAuthConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export async function GET() {
  if (!isAuthConfigured()) {
    return NextResponse.json({ configured: false });
  }
  return NextResponse.json({
    configured: true,
    url: supabaseUrl(),
    anonKey: supabaseAnonKey(),
  });
}
