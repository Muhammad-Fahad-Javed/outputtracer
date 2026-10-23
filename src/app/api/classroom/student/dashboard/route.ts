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
    return NextResponse.json({ success: false, error: "Dashboard service unavailable" }, { status: 503 });
  }

  try {
    // 1. Enrolled classrooms
    const { data: memberRows, error: memberError } = await admin
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

    if (memberError) throw memberError;
    const classroomIds = (memberRows || []).map((m: Record<string, unknown>) => String(m.classroom_id));

    const groupResult = await admin.from("classroom_group_members")
      .select("group_id, classroom_groups!inner(classroom_id)").eq("user_id", user.id);
    if (groupResult.error) throw groupResult.error;
    const groupIds = (groupResult.data || []).map(g => g.group_id);
    // IDs originate from verified membership rows, never request parameters.
    const submissionOwner = groupIds.length
      ? `student_id.eq.${user.id},group_id.in.(${groupIds.join(",")})`
      : `student_id.eq.${user.id}`;

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
      const { data: assignments, error: assignmentError } = await admin
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

      if (assignmentError) throw assignmentError;
      if (assignments?.length) {
        // Check submissions for this student
        const assignmentIds = assignments.map((a: Record<string, unknown>) => String(a.id));
        const { data: submissions, error: submissionError } = await admin
          .from("classroom_submissions")
          .select("assignment_id, status")
          .or(submissionOwner)
          .in("assignment_id", assignmentIds);

        if (submissionError) throw submissionError;
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
                maxPoints: Number(a.max_points ?? 100),
              });
            }
          }
        }
      }
    }

    // Read the canonical grade records written by gradingService, not legacy
    // classroom_submissions.grade/status fields that manual grading does not update.
    const { data: recentGradesData, error: gradesError } = classroomIds.length
      ? await admin
          .from("submission_grades")
          .select(`
            submission_id, total_points, max_points, graded_at,
            submission:classroom_submissions!inner(
              student_id, group_id,
              assignment:classroom_assignments!inner(
                id, title, classroom_id, classroom:classrooms(name)
              )
            )
          `)
          .or(submissionOwner, { referencedTable: "submission" })
          .in("submission.assignment.classroom_id", classroomIds)
          .order("graded_at", { ascending: false })
          .limit(10)
      : { data: [], error: null };

    if (gradesError) throw gradesError;
    const recentGrades = (recentGradesData || []).map((row: Record<string, unknown>) => {
      const submission = row.submission as Record<string, unknown> | null;
      const asgn = submission?.assignment as Record<string, unknown> | null;
      const cl = asgn?.classroom as Record<string, unknown> | null;
      return {
        submissionId: String(row.submission_id),
        assignmentId: String(asgn?.id || ""),
        assignmentTitle: String(asgn?.title || "Assignment"),
        classroomId: String(asgn?.classroom_id || ""),
        classroomName: String(cl?.name || "Classroom"),
        grade: Number(row.total_points ?? 0),
        maxPoints: Number(row.max_points ?? 100),
        gradedAt: String(row.graded_at || ""),
      };
    });

    // 4. Recent notifications
    const { data: notificationsData, error: notificationsError } = await admin
      .from("classroom_notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (notificationsError) throw notificationsError;
    const unread = await admin.from("classroom_notifications").select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id).eq("is_read", false);
    if (unread.error) throw unread.error;
    const unreadCount = unread.count ?? 0;

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
      admin.from("practice_progress").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("is_completed", true),
      admin.from("projects").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
    ]);

    if (lessonsRes.error || practiceRes.error || projectsRes.error) throw new Error("Could not load learning metrics.");

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
