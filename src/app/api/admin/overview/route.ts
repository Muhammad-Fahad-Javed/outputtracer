import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/learn/db";

export async function GET() {
  let user = null;
  try {
    const supabase = await createServerClient();
    if (supabase) {
      user = (await supabase.auth.getUser()).data.user;
    }
  } catch {
    // Unauthenticated
  }

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized. Administrator privileges required." }, { status: 403 });
  }

  const isAdmin = await checkIsAdmin(user.id);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: "Unauthorized. Administrator privileges required." }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({
      success: true,
      stats: {
        totalUsers: 0,
        totalClassrooms: 0,
        totalCourses: 0,
        totalAssignments: 0,
        pendingTeacherApps: 0,
        pendingAdminInvites: 0,
      },
      recentClassrooms: [],
      recentCourses: [],
    });
  }

  try {
    const [
      usersCountRes,
      classroomsCountRes,
      coursesCountRes,
      assignmentsCountRes,
      pendingAppsCountRes,
      pendingInvitesCountRes,
      recentClassroomsRes,
      recentCoursesRes,
    ] = await Promise.all([
      admin.from("profiles").select("*", { count: "exact", head: true }),
      admin.from("classrooms").select("*", { count: "exact", head: true }),
      admin.from("learn_courses").select("*", { count: "exact", head: true }),
      admin.from("classroom_assignments").select("*", { count: "exact", head: true }),
      admin.from("teacher_applications").select("*", { count: "exact", head: true }).eq("status", "pending_review"),
      admin.from("admin_invitations").select("*", { count: "exact", head: true }).eq("status", "pending"),
      admin.from("classrooms").select("id, name, subject, is_archived, created_at, teacher:profiles!classrooms_teacher_id_fkey(full_name, display_name)").order("created_at", { ascending: false }).limit(6),
      admin.from("learn_courses").select("id, title, slug, is_published, created_at").order("created_at", { ascending: false }).limit(6),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        totalUsers: usersCountRes.count ?? 0,
        totalClassrooms: classroomsCountRes.count ?? 0,
        totalCourses: coursesCountRes.count ?? 0,
        totalAssignments: assignmentsCountRes.count ?? 0,
        pendingTeacherApps: pendingAppsCountRes.count ?? 0,
        pendingAdminInvites: pendingInvitesCountRes.count ?? 0,
      },
      recentClassrooms: recentClassroomsRes.data || [],
      recentCourses: recentCoursesRes.data || [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load admin overview";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
