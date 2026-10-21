import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { checkIsAdmin } from "@/lib/learn/db";
import {
  listTeacherApplicationsAdmin,
  decideTeacherApplicationAdmin,
} from "@/lib/classroom/teacherService";
import { TeacherApplicationStatus, TeacherDecisionInput } from "@/lib/classroom/types";

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
    return NextResponse.json({ error: "Unauthorized. Admin privileges required." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = (searchParams.get("status") as TeacherApplicationStatus) || undefined;

  const result = await listTeacherApplicationsAdmin(admin.id, statusFilter);
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed loading applications" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    applications: result.applications,
  });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized. Admin privileges required." }, { status: 403 });
  }

  let body: {
    applicationId: string;
    decision: TeacherDecisionInput["decision"];
    reasonCode: TeacherDecisionInput["reasonCode"];
    reviewerNotes?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const { applicationId, decision, reasonCode, reviewerNotes } = body;
  if (!applicationId || !decision || !reasonCode) {
    return NextResponse.json(
      { error: "applicationId, decision, and reasonCode are required." },
      { status: 400 }
    );
  }

  const result = await decideTeacherApplicationAdmin(admin.id, applicationId, {
    decision,
    reasonCode,
    reviewerNotes,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed processing decision" }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    application: result.application,
    message: `Teacher application ${decision}ed successfully.`,
  });
}
