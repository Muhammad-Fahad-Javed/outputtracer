/**
 * GET /api/classroom/notifications
 *   List personal notifications for authenticated user.
 *
 * PATCH /api/classroom/notifications
 *   Mark a specific notification as read.
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { listUserNotifications, markNotificationAsRead } from "@/lib/classroom/communicationService";

export async function GET() {
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  const result = await listUserNotifications(user.id);
  return NextResponse.json({ success: true, notifications: result.notifications });
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  let body: { notificationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.notificationId) {
    return NextResponse.json({ success: false, error: "notificationId is required." }, { status: 400 });
  }

  await markNotificationAsRead(body.notificationId, user.id);
  return NextResponse.json({ success: true });
}
