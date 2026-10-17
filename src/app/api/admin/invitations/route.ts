import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkIsAdmin } from "@/lib/learn/db";
import {
  createAdminInvitation,
  listAdminInvitations,
  revokeAdminInvitation,
} from "@/lib/classroom/adminRoleService";

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: "Auth service unavailable" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await checkIsAdmin(user.id))) {
    return NextResponse.json({ success: false, error: "Unauthorized. Admin privileges required." }, { status: 403 });
  }

  const result = await listAdminInvitations(user.id);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: "Auth service unavailable" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await checkIsAdmin(user.id))) {
    return NextResponse.json({ success: false, error: "Unauthorized. Admin privileges required." }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body.inviteeEmail) {
      return NextResponse.json({ success: false, error: "inviteeEmail is required." }, { status: 400 });
    }

    const result = await createAdminInvitation(user.id, body.inviteeEmail, body.role || "admin");
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid payload";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: "Auth service unavailable" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await checkIsAdmin(user.id))) {
    return NextResponse.json({ success: false, error: "Unauthorized. Admin privileges required." }, { status: 403 });
  }

  const invitationId = req.nextUrl.searchParams.get("id");
  if (!invitationId) {
    return NextResponse.json({ success: false, error: "id parameter required." }, { status: 400 });
  }

  const result = await revokeAdminInvitation(user.id, invitationId);
  return NextResponse.json(result);
}
