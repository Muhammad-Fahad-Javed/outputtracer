/**
 * GET /api/classroom/[classId]/reports/progress
 *   Generates progress analytics and completion breakdown for an educator or administrator.
 *   Non-teachers and students are strictly blocked.
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { generateClassroomProgressReport } from "@/lib/classroom/adminService";

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

  const result = await generateClassroomProgressReport(user.id, classId);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });
  }

  return NextResponse.json({ success: true, report: result.report });
}
