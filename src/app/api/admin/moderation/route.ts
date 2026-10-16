/**
 * POST /api/admin/moderation
 *   Perform administrative moderation:
 *   - Archive or unarchive classrooms
 *   - Suspend or reinstate teacher accounts
 *   Strictly limited to platform administrators. Every action is recorded in the audit log.
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { checkIsAdmin } from "@/lib/learn/db";
import {
  moderateClassroomAdmin,
  moderateTeacherProfileAdmin,
} from "@/lib/classroom/adminService";
import { clientIpFromForwarded } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  const isAdmin = await checkIsAdmin(user.id);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: "Administrator privileges required." }, { status: 403 });
  }

  const ip = clientIpFromForwarded(
    request.headers.get("x-forwarded-for") ?? undefined,
    undefined,
    process.env.TRUST_PROXY === "1"
  );

  let body: {
    target: "classroom" | "teacher";
    targetId: string;
    action: "archive" | "unarchive" | "suspend" | "reinstate";
    reason: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!body.target || !body.targetId || !body.action || !body.reason) {
    return NextResponse.json(
      { success: false, error: "target, targetId, action, and reason are required." },
      { status: 400 }
    );
  }

  if (body.target === "classroom") {
    if (body.action !== "archive" && body.action !== "unarchive") {
      return NextResponse.json(
        { success: false, error: "Invalid action for classroom moderation. Must be 'archive' or 'unarchive'." },
        { status: 400 }
      );
    }

    const result = await moderateClassroomAdmin(
      user.id,
      body.targetId,
      body.action,
      body.reason,
      ip
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Classroom ${body.action}d successfully.`,
    });
  }

  if (body.target === "teacher") {
    if (body.action !== "suspend" && body.action !== "reinstate") {
      return NextResponse.json(
        { success: false, error: "Invalid action for teacher moderation. Must be 'suspend' or 'reinstate'." },
        { status: 400 }
      );
    }

    const result = await moderateTeacherProfileAdmin(
      user.id,
      body.targetId,
      body.action,
      body.reason,
      ip
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Teacher profile ${body.action}d successfully.`,
    });
  }

  return NextResponse.json({ success: false, error: "Invalid target specified." }, { status: 400 });
}
