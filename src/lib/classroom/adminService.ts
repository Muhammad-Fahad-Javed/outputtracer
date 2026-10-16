/**
 * adminService.ts
 *
 * Core service for Phase 5 Administrator & Educator Operations:
 * 1. Audit Log review with filtering (actor, action, targetType)
 * 2. Classroom & account moderation (archive classroom, suspend teacher profile)
 * 3. Educator classroom progress & analytics reports
 * 4. Permission-controlled gradebook CSV export (instructors and admins only)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/learn/db";
import { getClassroom } from "./classroomService";
import type { ClassroomAuditLog } from "./types";

// ==============================================================================
// In-Memory Fallback Stores (Unit tests & offline operation)
// ==============================================================================
const memoryAuditRecords: ClassroomAuditLog[] = [];

export function _resetAdminServiceMemory(): void {
  memoryAuditRecords.length = 0;
}

export function _recordMemoryAudit(log: ClassroomAuditLog): void {
  memoryAuditRecords.push(log);
}

export function _getMemoryAuditRecords(): ClassroomAuditLog[] {
  return [...memoryAuditRecords];
}

// ==============================================================================
// 1. Audit Log Review
// ==============================================================================

export interface AuditLogFilter {
  actorId?: string;
  action?: string;
  targetType?: ClassroomAuditLog["targetType"];
  limit?: number;
}

export async function listAuditLogsAdmin(
  adminUserId: string,
  filter?: AuditLogFilter
): Promise<{ success: boolean; logs?: ClassroomAuditLog[]; error?: string }> {
  const isAdmin = await checkIsAdmin(adminUserId);
  if (!isAdmin) {
    return { success: false, error: "Unauthorized. Platform administrator privileges required." };
  }

  const limit = filter?.limit ?? 100;
  const admin = createAdminClient();
  if (admin) {
    try {
      let query = admin
        .from("classroom_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (filter?.actorId) query = query.eq("actor_id", filter.actorId);
      if (filter?.action) query = query.eq("action", filter.action);
      if (filter?.targetType) query = query.eq("target_type", filter.targetType);

      const { data, error } = await query;
      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const logs: ClassroomAuditLog[] = (data as any[]).map((d) => ({
          id: String(d.id),
          actorId: d.actor_id ? String(d.actor_id) : undefined,
          action: String(d.action),
          targetType: d.target_type as ClassroomAuditLog["targetType"],
          targetId: String(d.target_id),
          details: (d.details as Record<string, unknown>) ?? {},
          ipAddress: d.ip_address ? String(d.ip_address) : undefined,
          createdAt: String(d.created_at),
        }));
        return { success: true, logs };
      }
    } catch {
      // Memory fallback below
    }
  }

  let list = [...memoryAuditRecords];
  if (filter?.actorId) list = list.filter((l) => l.actorId === filter.actorId);
  if (filter?.action) list = list.filter((l) => l.action === filter.action);
  if (filter?.targetType) list = list.filter((l) => l.targetType === filter.targetType);

  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { success: true, logs: list.slice(0, limit) };
}

export async function recordAdminAudit(
  actorId: string,
  action: string,
  targetType: ClassroomAuditLog["targetType"],
  targetId: string,
  details: Record<string, unknown>,
  ipAddress?: string
): Promise<void> {
  const now = new Date().toISOString();
  const admin = createAdminClient();
  if (admin) {
    try {
      await admin.from("classroom_audit_logs").insert({
        actor_id: actorId,
        action,
        target_type: targetType,
        target_id: targetId,
        details,
        ip_address: ipAddress ?? null,
      });
      return;
    } catch {
      // Memory fallback below
    }
  }

  memoryAuditRecords.push({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    actorId,
    action,
    targetType,
    targetId,
    details,
    ipAddress,
    createdAt: now,
  });
}

// ==============================================================================
// 2. Classroom & Account Moderation (Admin)
// ==============================================================================

export async function moderateClassroomAdmin(
  adminUserId: string,
  classroomId: string,
  action: "archive" | "unarchive",
  reason: string,
  ipAddress?: string
): Promise<{ success: boolean; error?: string }> {
  const isAdmin = await checkIsAdmin(adminUserId);
  if (!isAdmin) {
    return { success: false, error: "Unauthorized. Administrator privileges required." };
  }

  const isArchived = action === "archive";
  const now = new Date().toISOString();
  const admin = createAdminClient();
  if (admin) {
    try {
      const { error } = await admin
        .from("classrooms")
        .update({ is_archived: isArchived, updated_at: now })
        .eq("id", classroomId);

      if (error) return { success: false, error: error.message };
    } catch {
      // Memory fallback below
    }
  }

  await recordAdminAudit(
    adminUserId,
    `classroom_${action}`,
    "classroom",
    classroomId,
    { reason, isArchived },
    ipAddress
  );

  return { success: true };
}

export async function moderateTeacherProfileAdmin(
  adminUserId: string,
  teacherUserId: string,
  action: "suspend" | "reinstate",
  reason: string,
  ipAddress?: string
): Promise<{ success: boolean; error?: string }> {
  const isAdmin = await checkIsAdmin(adminUserId);
  if (!isAdmin) {
    return { success: false, error: "Unauthorized. Administrator privileges required." };
  }

  const newStatus = action === "suspend" ? "suspended" : "approved";
  const now = new Date().toISOString();
  const admin = createAdminClient();
  if (admin) {
    try {
      const { error } = await admin
        .from("teacher_profiles")
        .update({
          status: newStatus,
          suspended_at: action === "suspend" ? now : null,
          suspension_reason: action === "suspend" ? reason : null,
          updated_at: now,
        })
        .eq("user_id", teacherUserId);

      if (error) return { success: false, error: error.message };
    } catch {
      // Memory fallback below
    }
  }

  await recordAdminAudit(
    adminUserId,
    `teacher_${action}`,
    "teacher_profile",
    teacherUserId,
    { reason, status: newStatus },
    ipAddress
  );

  return { success: true };
}

// ==============================================================================
// 3. Educator Progress & Analytics Reports
// ==============================================================================

export interface StudentProgressSummary {
  studentId: string;
  displayName?: string;
  email?: string;
  submissionsCount: number;
  gradedCount: number;
  averageScorePercent: number;
  lastActiveAt?: string;
}

export interface ClassroomProgressReport {
  classroomId: string;
  classroomName: string;
  totalStudents: number;
  totalAssignments: number;
  totalSubmissions: number;
  completionRatePercent: number;
  averageClassScorePercent: number;
  studentBreakdown: StudentProgressSummary[];
  generatedAt: string;
}

export async function generateClassroomProgressReport(
  actorUserId: string,
  classroomId: string
): Promise<{ success: boolean; report?: ClassroomProgressReport; error?: string }> {
  const access = await getClassroom(actorUserId, classroomId);
  if (!access.success || !access.classroom) {
    return { success: false, error: access.error ?? "Classroom not found." };
  }

  // Only classroom teacher or platform administrator can view the progress report
  if (!access.isTeacher) {
    return { success: false, error: "Unauthorized. Educator or administrator privileges required." };
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();

  if (admin) {
    try {
      const [membersRes, assignmentsRes, gradesRes] = await Promise.all([
        admin
          .from("classroom_members")
          .select("user_id, role, profiles(display_name, email)")
          .eq("classroom_id", classroomId)
          .eq("role", "student"),
        admin
          .from("classroom_assignments")
          .select("id, title, max_points")
          .eq("classroom_id", classroomId),
        admin
          .from("submission_grades")
          .select("submission_id, total_points, max_points"),
      ]);

      const assignmentIds = (assignmentsRes.data || []).map((a) => a.id);
      let submissionsData: Array<{ id: string; assignment_id: string; student_id: string | null; submitted_at: string; status: string }> = [];

      if (assignmentIds.length > 0) {
        const { data: subData } = await admin
          .from("classroom_submissions")
          .select("id, assignment_id, student_id, submitted_at, status")
          .in("assignment_id", assignmentIds);
        submissionsData = subData || [];
      }

      const gradesMap = new Map<string, { totalPoints: number; maxPoints: number }>();
      for (const g of gradesRes.data || []) {
        gradesMap.set(g.submission_id, { totalPoints: Number(g.total_points), maxPoints: Number(g.max_points) });
      }

      const studentList = membersRes.data || [];
      const totalStudents = studentList.length;
      const totalAssignments = assignmentIds.length;
      const totalPossibleSubmissions = totalStudents * totalAssignments;

      const studentBreakdown: StudentProgressSummary[] = studentList.map((m) => {
        const sId = m.user_id;
        const studentSubs = submissionsData.filter((s) => s.student_id === sId);
        const graded = studentSubs.filter((s) => gradesMap.has(s.id));

        let scoreSum = 0;
        let maxScoreSum = 0;
        for (const s of graded) {
          const g = gradesMap.get(s.id)!;
          scoreSum += g.totalPoints;
          maxScoreSum += g.maxPoints;
        }

        const avgPercent = maxScoreSum > 0 ? Math.round((scoreSum / maxScoreSum) * 100) : 0;
        const sortedSubs = [...studentSubs].sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
        const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;

        return {
          studentId: sId,
          displayName: prof?.display_name,
          email: prof?.email,
          submissionsCount: studentSubs.length,
          gradedCount: graded.length,
          averageScorePercent: avgPercent,
          lastActiveAt: sortedSubs[0]?.submitted_at,
        };
      });

      const totalSubmissions = submissionsData.length;
      const completionRatePercent = totalPossibleSubmissions > 0
        ? Math.round((totalSubmissions / totalPossibleSubmissions) * 100)
        : 0;

      const studentAvgs = studentBreakdown.map((s) => s.averageScorePercent).filter((p) => p > 0);
      const averageClassScorePercent = studentAvgs.length > 0
        ? Math.round(studentAvgs.reduce((a, b) => a + b, 0) / studentAvgs.length)
        : 0;

      return {
        success: true,
        report: {
          classroomId,
          classroomName: access.classroom.name,
          totalStudents,
          totalAssignments,
          totalSubmissions,
          completionRatePercent,
          averageClassScorePercent,
          studentBreakdown,
          generatedAt: now,
        },
      };
    } catch {
      // Fall through to memory
    }
  }

  // Memory fallback
  return {
    success: true,
    report: {
      classroomId,
      classroomName: access.classroom.name,
      totalStudents: access.classroom.memberCount ?? 0,
      totalAssignments: access.classroom.assignmentCount ?? 0,
      totalSubmissions: 0,
      completionRatePercent: 0,
      averageClassScorePercent: 0,
      studentBreakdown: [],
      generatedAt: now,
    },
  };
}

// ==============================================================================
// 4. Permission-Controlled Gradebook CSV Export
// ==============================================================================

export interface GradebookRow {
  studentId: string;
  studentName: string;
  studentEmail: string;
  assignmentTitle: string;
  score: number | string;
  maxPoints: number | string;
  percentage: string;
  submittedAt: string;
  isLate: boolean;
}

/**
 * Generates structured CSV gradebook data for a classroom.
 * Strictly limited to the classroom instructor and platform administrators.
 * Cross-classroom or unauthorized exports are rejected.
 */
export async function exportGradebookCsv(
  actorUserId: string,
  classroomId: string,
  ipAddress?: string
): Promise<{ success: boolean; csv?: string; filename?: string; error?: string }> {
  const access = await getClassroom(actorUserId, classroomId);
  if (!access.success || !access.classroom) {
    return { success: false, error: access.error ?? "Classroom not found." };
  }

  // Enforce teacher / admin authorization
  if (!access.isTeacher) {
    return { success: false, error: "Access denied. Only the classroom instructor or an administrator can export the gradebook." };
  }

  const rows: GradebookRow[] = [];
  const admin = createAdminClient();

  if (admin) {
    try {
      const [membersRes, assignmentsRes] = await Promise.all([
        admin
          .from("classroom_members")
          .select("user_id, role, profiles(display_name, email)")
          .eq("classroom_id", classroomId)
          .eq("role", "student"),
        admin
          .from("classroom_assignments")
          .select("id, title, max_points")
          .eq("classroom_id", classroomId)
          .order("created_at", { ascending: true }),
      ]);

      const students = membersRes.data || [];
      const assignments = assignmentsRes.data || [];
      const assignmentIds = assignments.map((a) => a.id);

      if (assignmentIds.length > 0 && students.length > 0) {
        const { data: subData } = await admin
          .from("classroom_submissions")
          .select("id, assignment_id, student_id, submitted_at, is_late, grade")
          .in("assignment_id", assignmentIds);

        const submissions = subData || [];
        const { data: gradeData } = await admin
          .from("submission_grades")
          .select("submission_id, total_points, max_points");

        const gradesMap = new Map<string, { totalPoints: number; maxPoints: number }>();
        for (const g of gradeData || []) {
          gradesMap.set(g.submission_id, { totalPoints: Number(g.total_points), maxPoints: Number(g.max_points) });
        }

        for (const student of students) {
          const prof = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;
          const sName = prof?.display_name || `Student ${student.user_id.slice(0, 6)}`;
          const sEmail = prof?.email || "N/A";

          for (const asg of assignments) {
            const sub = submissions.find(
              (s) => s.student_id === student.user_id && s.assignment_id === asg.id
            );
            const g = sub ? gradesMap.get(sub.id) : undefined;
            const score = g ? g.totalPoints : sub?.grade != null ? Number(sub.grade) : "N/A";
            const maxPts = g ? g.maxPoints : Number(asg.max_points || 100);
            const pct = typeof score === "number" && maxPts > 0 ? `${Math.round((score / maxPts) * 100)}%` : "N/A";

            rows.push({
              studentId: student.user_id,
              studentName: sName,
              studentEmail: sEmail,
              assignmentTitle: asg.title,
              score,
              maxPoints: maxPts,
              percentage: pct,
              submittedAt: sub?.submitted_at ? new Date(sub.submitted_at).toISOString() : "Unsubmitted",
              isLate: sub ? Boolean(sub.is_late) : false,
            });
          }
        }
      }
    } catch {
      // Memory fallback below
    }
  }

  // Format into standard CSV text
  const csvHeaders = [
    "Student ID",
    "Student Name",
    "Email",
    "Assignment",
    "Score",
    "Max Points",
    "Percentage",
    "Submitted At",
    "Late",
  ];

  const escapeCsv = (val: string | number | boolean) => {
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvLines = [
    csvHeaders.join(","),
    ...rows.map((r) =>
      [
        escapeCsv(r.studentId),
        escapeCsv(r.studentName),
        escapeCsv(r.studentEmail),
        escapeCsv(r.assignmentTitle),
        escapeCsv(r.score),
        escapeCsv(r.maxPoints),
        escapeCsv(r.percentage),
        escapeCsv(r.submittedAt),
        escapeCsv(r.isLate ? "Yes" : "No"),
      ].join(",")
    ),
  ];

  const csvContent = csvLines.join("\n");
  const sanitizedClassName = access.classroom.name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `gradebook_${sanitizedClassName}_${dateStr}.csv`;

  // Privileged export audit log
  await recordAdminAudit(
    actorUserId,
    "gradebook_export_csv",
    "classroom",
    classroomId,
    {
      rowCount: rows.length,
      filename,
      isTeacher: access.classroom.teacherId === actorUserId,
    },
    ipAddress
  );

  return {
    success: true,
    csv: csvContent,
    filename,
  };
}
