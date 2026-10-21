/**
 * GET /api/classroom/[classId]/reports
 *   List abuse reports for the classroom (instructor only).
 *
 * POST /api/classroom/[classId]/reports
 *   Submit an abuse report (any enrolled member).
 *
 * PATCH /api/classroom/[classId]/reports
 *   Resolve or dismiss an abuse report and optionally hide offensive content (instructor only).
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getClassroom } from "@/lib/classroom/classroomService";
import {
  submitAbuseReport,
  resolveAbuseReport,
} from "@/lib/classroom/communicationService";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CreateAbuseReportInput,
  AbuseReportStatus,
} from "@/lib/classroom/communicationTypes";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  const { classId } = await params;
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  const access = await getClassroom(user.id, classId);
  if (!access.success || !access.isTeacher) {
    return NextResponse.json({ success: false, error: "Instructor access required to review reports." }, { status: 403 });
  }

  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_abuse_reports")
        .select("*, profiles:reporter_id(display_name)")
        .eq("classroom_id", classId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        return NextResponse.json({ success: true, reports: data });
      }
    } catch {
      // Fall through
    }
  }

  return NextResponse.json({ success: true, reports: [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  const { classId } = await params;
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  let body: Omit<CreateAbuseReportInput, "classroomId">;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }

  const result = await submitAbuseReport(user.id, {
    classroomId: classId,
    targetType: body.targetType,
    targetId: body.targetId,
    reason: body.reason,
    details: body.details,
  });

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, report: result.report });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  const { classId } = await params;
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  let body: {
    reportId?: string;
    status?: AbuseReportStatus;
    moderatorNotes?: string;
    hideContent?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.reportId || !body.status) {
    return NextResponse.json({ success: false, error: "reportId and status are required." }, { status: 400 });
  }

  const result = await resolveAbuseReport(
    body.reportId,
    user.id,
    classId,
    body.status,
    body.moderatorNotes,
    body.hideContent
  );

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
