import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { checkIsAdmin } from "@/lib/learn/db";
import { listUsersAdmin, updateUserRoleAdmin } from "@/lib/classroom/profileService";

async function requireAdmin() {
  let user = null;
  try {
    const supabase = await createServerClient();
    if (supabase) {
      user = (await supabase.auth.getUser()).data.user;
    }
  } catch {
    // Unauthenticated
  }

  if (!user) return null;
  const isAdmin = await checkIsAdmin(user.id);
  if (!isAdmin) return null;
  return user;
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ success: false, error: "Unauthorized. Administrator privileges required." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role") || undefined;
  const search = searchParams.get("search") || undefined;
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 100;

  const result = await listUsersAdmin(admin.id, { role, search, limit });
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    users: result.users,
    stats: result.stats,
  });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ success: false, error: "Unauthorized. Administrator privileges required." }, { status: 403 });
  }

  let body: {
    targetUserId: string;
    newRole: "student" | "teacher" | "admin" | "staff";
    action: "add" | "remove";
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!body.targetUserId || !body.newRole || !body.action) {
    return NextResponse.json(
      { success: false, error: "targetUserId, newRole, and action are required." },
      { status: 400 }
    );
  }

  const result = await updateUserRoleAdmin(
    admin.id,
    body.targetUserId,
    body.newRole,
    body.action
  );

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    message: `Role ${body.newRole} successfully ${body.action === "add" ? "granted to" : "revoked from"} user.`,
  });
}
