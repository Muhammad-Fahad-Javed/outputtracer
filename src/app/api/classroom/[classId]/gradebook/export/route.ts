/**
 * GET /api/classroom/[classId]/gradebook/export
 *   Exports classroom gradebook in RFC-4180 CSV format.
 *   Strictly authorized: classroom instructor and platform administrators only.
 *   Every export action is recorded in the platform audit log.
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { exportGradebookCsv } from "@/lib/classroom/adminService";
import { clientIpFromForwarded } from "@/lib/rateLimit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  const { classId } = await params;
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  const ip = clientIpFromForwarded(
    request.headers.get("x-forwarded-for") ?? undefined,
    undefined,
    process.env.TRUST_PROXY === "1"
  );

  const result = await exportGradebookCsv(user.id, classId, ip);
  if (!result.success || !result.csv) {
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });
  }

  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename || "gradebook.csv"}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
