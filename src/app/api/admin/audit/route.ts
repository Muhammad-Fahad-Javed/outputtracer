/**
 * GET /api/admin/audit
 *   Fetch platform and classroom audit logs with optional filters.
 *   Strictly limited to platform administrators.
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { checkIsAdmin } from "@/lib/learn/db";
import { listAuditLogsAdmin, AuditLogFilter } from "@/lib/classroom/adminService";
import type { ClassroomAuditLog } from "@/lib/classroom/types";

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  const isAdmin = await checkIsAdmin(user.id);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: "Administrator privileges required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const filter: AuditLogFilter = {
    actorId: url.searchParams.get("actorId") || undefined,
    action: url.searchParams.get("action") || undefined,
    targetType: (url.searchParams.get("targetType") as ClassroomAuditLog["targetType"]) || undefined,
    limit: url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : 100,
  };

  const result = await listAuditLogsAdmin(user.id, filter);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, logs: result.logs });
}
