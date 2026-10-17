import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { acceptAdminInvitation } from "@/lib/classroom/adminRoleService";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: "Auth service unavailable" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ success: false, error: "Please log in to accept the administrator invitation." }, { status: 401 });
  }

  const { token } = await params;
  const result = await acceptAdminInvitation(token, user.id, user.email);

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, message: "Administrator permissions successfully activated." });
}
