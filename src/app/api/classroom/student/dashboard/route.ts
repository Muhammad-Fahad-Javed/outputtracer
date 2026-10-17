import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: "Auth service unavailable" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({
      success: true,
      stats: { enrolledCount: 0, pendingAssignmentsCount: 0, unreadCount: 0 },
      classrooms: [],
      upcomingDeadlines: [],
      recentGrades: [],
      recentActivity: [],
    });
  }

  try {
    // 1. Enrolled classrooms
    const { data: memberRows } = await admin
      .from("classroom_members")
      .select(`
        classroom_id,
        role,
        classroom:classrooms(
          id,
          name,
          subject,
          description,
          teacher:profiles!classrooms_teacher_id_fkey(full_name, username, display_name)
        )
      `)
      .eq("user_id", user.id)
      .eq("role", "student");

    const classroomIds = (memberRows || []).map((m: Record<string, unknown>) => String(m.classroom_id));

    // 2. Active assignments in those classrooms
    let pendingAssignmentsCount = 0;
    const upcomingDeadlines: Array<{
      id: string;
      title: string;
      classroomId: string;
      classroomName: string;
      dueDate?: string;
      maxPoints: number;
    }> = [];

    if (classroomIds.length > 0) {
      const { data: assignments } = await admin
        .from("classroom_assignments")
        .select(`
          id,
          title,
          classroom_id,
          due_date,
          max_points,
          classroom:classrooms(name)
        `)
        .in("classroom_id", classroomIds)
        .eq("is_published", true)
        .order("due_date", { ascending: true });

      if (assignments) {
        // Check submissions for this student
        const assignmentIds = assignments.map((a: Record<string, unknown>) => String(a.id));
        const { data: submissions } = await admin
          .from("classroom_submissions")
          .select("assignment_id, status")
          .eq("student_id", user.id)
          .in("assignment_id", assignmentIds);

        const submittedIds = new Set(
          (submissions || [])
            .filter((s: Record<string, unknown>) => s.status === "submitted" || s.status === "graded")
            .map((s: Record<string, unknown>) => String(s.assignment_id))
        );

        const now = new Date();
        for (const a of assignments as Record<string, unknown>[]) {
          const aid = String(a.id);
          const hasSubmitted = submittedIds.has(aid);
          if (!hasSubmitted) {
            pendingAssignmentsCount++;
            if (a.due_date && new Date(String(a.due_date)) > now) {
              const cl = a.classroom as Record<string, unknown> | null;
              upcomingDeadlines.push({
                id: aid,
                title: String(a.title),
                classroomId: String(a.classroom_id),
                classroomName: String(cl?.name || "Classroom"),
                dueDate: String(a.due_date),
                maxPoints: Number(a.max_points || 100),
              });
            }
          }
        }
      }
    }

    // 3. Recent grades
    const { data: recentGradesData } = await admin
      .from("classroom_submissions")
      .select(`
        id,
        grade,
        graded_at,
        assignment:classroom_assignments(
          id,
          title,
          max_points,
          classroom_id,
          classroom:classrooms(name)
        )
      `)
      .eq("student_id", user.id)
      .eq("status", "graded")
      .order("graded_at", { ascending: false })
      .limit(10);

    const recentGrades = (recentGradesData || []).map((row: Record<string, unknown>) => {
      const asgn = row.assignment as Record<string, unknown> | null;
      const cl = asgn?.classroom as Record<string, unknown> | null;
      return {
        submissionId: String(row.id),
        assignmentId: String(asgn?.id || ""),
        assignmentTitle: String(asgn?.title || "Assignment"),
        classroomId: String(asgn?.classroom_id || ""),
        classroomName: String(cl?.name || "Classroom"),
        grade: Number(row.grade || 0),
        maxPoints: Number(asgn?.max_points || 100),
        gradedAt: String(row.graded_at || ""),
      };
    });

    // 4. Recent notifications
    const { data: notificationsData } = await admin
      .from("classroom_notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    const unreadCount = (notificationsData || []).filter((n: Record<string, unknown>) => !n.is_read).length;

    // 5. Format classrooms list
    const classrooms = (memberRows || []).map((m: Record<string, unknown>) => {
      const cl = m.classroom as Record<string, unknown> | null;
      const teacher = cl?.teacher as Record<string, unknown> | null;
      return {
        id: String(m.classroom_id),
        name: String(cl?.name || "Untitled Class"),
        subject: String(cl?.subject || "Computer Science"),
        description: String(cl?.description || ""),
        teacherName: String(teacher?.full_name || teacher?.username || "Instructor"),
      };
    });

    // 6. Persistent learning & project metrics
    const [lessonsRes, practiceRes, projectsRes] = await Promise.all([
      admin.from("learn_lesson_completions").select("*", { count: "exact", head: true }).eq("user_id", user.id),
      admin.from("practice_progress").select("*", { count: "exact", head: true }).eq("user_id", user.id),
      admin.from("projects").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        enrolledCount: classrooms.length,
        pendingAssignmentsCount,
        unreadCount,
        completedLessonsCount: lessonsRes.count ?? 0,
        solvedProblemsCount: practiceRes.count ?? 0,
        savedProjectsCount: projectsRes.count ?? 0,
      },
      classrooms,
      upcomingDeadlines: upcomingDeadlines.slice(0, 10),
      recentGrades,
      recentActivity: notificationsData || [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load student dashboard";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
