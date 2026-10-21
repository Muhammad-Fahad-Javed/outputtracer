import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { listConversations } from "@/lib/classroom/messagingService";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: "Auth service unavailable" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { classId } = await params;
  const result = await listConversations(classId, user.id);

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });
  }

  return NextResponse.json({ success: true, conversations: result.conversations });
}
