import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sendMessage, listMessages } from "@/lib/classroom/messagingService";

export async function GET(
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
  const searchParams = req.nextUrl.searchParams;
  const recipientId = searchParams.get("recipientId") || undefined;
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const result = await listMessages(classId, user.id, { recipientId, limit, offset });
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });
  }

  return NextResponse.json({ success: true, messages: result.messages });
}

export async function POST(
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
    const result = await sendMessage(classId, user.id, {
      clientRequestId: typeof body.clientRequestId === "string" ? body.clientRequestId : undefined,
      recipientId: body.recipientId || undefined,
      content: body.content,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: result.message });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid payload";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
