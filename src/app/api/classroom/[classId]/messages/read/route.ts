import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { markMessagesRead } from "@/lib/classroom/messagingService";

export async function PATCH(
  req: NextRequest,
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

  try {
    const body = await req.json();
    const result = await markMessagesRead(classId, user.id, body.senderId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid payload";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
