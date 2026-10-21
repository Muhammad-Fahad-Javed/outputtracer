import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/learn/db";
import {
  TeacherApplication,
  TeacherApplicationInput,
  TeacherDecisionInput,
  ClassroomAuditLog,
  TeacherApplicationStatus,
} from "./types";
import { _setMemoryTeacherAppStatus, _setMemoryTeacherProfile } from "./roles";
import {
  notifyPlatformOwnerNewTeacherApplication,
  notifyTeacherApplicationDecision,
} from "./emailProvider";
import { siteUrl as resolveSiteUrl } from "@/lib/siteUrl";

// In-memory fallback stores for test environments
const memoryApplications: TeacherApplication[] = [];
const memoryAuditLogs: ClassroomAuditLog[] = [];

export function _resetTeacherServiceMemory(): void {
  memoryApplications.length = 0;
  memoryAuditLogs.length = 0;
}

export function _getMemoryAuditLogs(): ClassroomAuditLog[] {
  return [...memoryAuditLogs];
}

export function _getMemoryApplications(): TeacherApplication[] {
  return [...memoryApplications];
}

function normalizeApplication(row: Record<string, unknown>): TeacherApplication {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    status: row.status as TeacherApplicationStatus,
    institutionName: String(row.institution_name),
    institutionEmail: row.institution_email ? String(row.institution_email) : undefined,
    department: row.department ? String(row.department) : undefined,
    coursesIntended: row.courses_intended ? String(row.courses_intended) : undefined,
    evidenceNotes: String(row.evidence_notes),
    reviewerId: row.reviewer_id ? String(row.reviewer_id) : undefined,
    reviewerNotes: row.reviewer_notes ? String(row.reviewer_notes) : undefined,
    decisionReasonCode: row.decision_reason_code ? (row.decision_reason_code as TeacherApplication["decisionReasonCode"]) : undefined,
    submittedAt: String(row.submitted_at || row.created_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Submits or saves a draft teacher verification application.
 */
export async function submitTeacherApplication(
  userId: string,
  input: TeacherApplicationInput,
  ipAddress?: string
): Promise<{ success: boolean; application?: TeacherApplication; error?: string }> {
  if (!userId) {
    return { success: false, error: "Authentication required" };
  }

  const institutionName = (input.institutionName || "").trim();
  const evidenceNotes = (input.evidenceNotes || "").trim();

  if (institutionName.length < 2 || institutionName.length > 160) {
    return { success: false, error: "Institution name must be between 2 and 160 characters" };
  }

  if (evidenceNotes.length < 5 || evidenceNotes.length > 2000) {
    return { success: false, error: "Evidence notes must be between 5 and 2000 characters" };
  }

  if (input.institutionEmail) {
    const email = input.institutionEmail.trim();
    if (email.length > 255 || !email.includes("@")) {
      return { success: false, error: "Invalid institutional email address" };
    }
  }

  const targetStatus: TeacherApplicationStatus = input.isDraft ? "draft" : "pending_review";
  const now = new Date().toISOString();

  const admin = createAdminClient();
  if (admin) {
    try {
      // 1. Check if user already has an active pending or approved application
      const { data: existing } = await admin
        .from("teacher_applications")
        .select("id, status")
        .eq("user_id", userId)
        .in("status", ["pending_review", "approved"])
        .maybeSingle();

      if (existing) {
        if (existing.status === "approved") {
          return { success: false, error: "You are already an approved teacher" };
        }
        if (existing.status === "pending_review" && !input.isDraft) {
          return { success: false, error: "You already have a teacher application pending review" };
        }
      }

      // 2. Insert application
      const { data, error } = await admin
        .from("teacher_applications")
        .insert({
          user_id: userId,
          status: targetStatus,
          institution_name: institutionName,
          institution_email: input.institutionEmail?.trim() || null,
          department: input.department?.trim() || null,
          courses_intended: input.coursesIntended?.trim() || null,
          evidence_notes: evidenceNotes,
          submitted_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (error) {
        console.warn("Database error submitting teacher application:", error.message);
        return { success: false, error: `Could not save application to database: ${error.message}` };
      }

      const app = normalizeApplication(data as Record<string, unknown>);

      // 3. Record audit log
      await admin.from("classroom_audit_logs").insert({
        actor_id: userId,
        action: input.isDraft ? "teacher_application_draft_saved" : "teacher_application_submitted",
        target_type: "teacher_application",
        target_id: app.id,
        details: {
          institutionName,
          status: targetStatus,
        },
        ip_address: ipAddress || null,
      });

      // 4. Dispatch email notification to platform owner (if not draft)
      if (!input.isDraft) {
        try {
          const { data: profile } = await admin
            .from("profiles")
            .select("display_name, email, full_name")
            .eq("id", userId)
            .maybeSingle();

          const applicantName = profile?.full_name || profile?.display_name || "Applicant";
          const applicantEmail = input.institutionEmail || profile?.email || "Unknown Email";
          const siteUrl = resolveSiteUrl();

          void notifyPlatformOwnerNewTeacherApplication({
            applicantName,
            applicantEmail,
            institutionName,
            department: input.department?.trim() || undefined,
            submittedAt: now,
            reviewUrl: `${siteUrl}/admin/teachers`,
          }).catch((err) => console.warn("Failed sending owner notification email:", err));
        } catch {
          // Non-blocking notification failure
        }
      }

      return { success: true, application: app };
    } catch (err) {
      console.warn("Error submitting teacher application:", err);
      return { success: false, error: "Unexpected error during application submission" };
    }
  }

  // Fallback in-memory implementation for test environments
  const existingMemory = memoryApplications.find(
    (a) => a.userId === userId && (a.status === "pending_review" || a.status === "approved")
  );
  if (existingMemory) {
    if (existingMemory.status === "approved") {
      return { success: false, error: "You are already an approved teacher" };
    }
    return { success: false, error: "You already have a teacher application pending review" };
  }

  const newApp: TeacherApplication = {
    id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId,
    status: targetStatus,
    institutionName,
    institutionEmail: input.institutionEmail?.trim(),
    department: input.department?.trim(),
    coursesIntended: input.coursesIntended?.trim(),
    evidenceNotes,
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  memoryApplications.push(newApp);
  _setMemoryTeacherAppStatus(userId, targetStatus);

  memoryAuditLogs.push({
    id: `log-${Date.now()}`,
    actorId: userId,
    action: input.isDraft ? "teacher_application_draft_saved" : "teacher_application_submitted",
    targetType: "teacher_application",
    targetId: newApp.id,
    details: { institutionName, status: targetStatus },
    ipAddress,
    createdAt: now,
  });

  return { success: true, application: newApp };
}

/**
 * Retrieves the current user's most recent application.
 */
export async function getTeacherApplicationForUser(
  userId: string
): Promise<TeacherApplication | null> {
  if (!userId) return null;

  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("teacher_applications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return normalizeApplication(data as Record<string, unknown>);
      }
    } catch {
      // Memory fallback below
    }
  }

  const memory = memoryApplications
    .filter((a) => a.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return memory || null;
}

/**
 * Admin: List teacher applications with optional status filter.
 */
export async function listTeacherApplicationsAdmin(
  adminUserId: string,
  filterStatus?: TeacherApplicationStatus
): Promise<{ success: boolean; applications?: TeacherApplication[]; error?: string }> {
  const isAdmin = await checkIsAdmin(adminUserId);
  if (!isAdmin) {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  const admin = createAdminClient();
  if (admin) {
    try {
      let query = admin
        .from("teacher_applications")
        .select("*")
        .order("submitted_at", { ascending: false });

      if (filterStatus) {
        query = query.eq("status", filterStatus);
      }

      const { data, error } = await query;
      if (!error && data) {
        return {
          success: true,
          applications: data.map((r) => normalizeApplication(r as Record<string, unknown>)),
        };
      }
    } catch {
      // Memory fallback below
    }
  }

  let list = [...memoryApplications];
  if (filterStatus) {
    list = list.filter((a) => a.status === filterStatus);
  }
  list.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  return { success: true, applications: list };
}

/**
 * Admin: Review and decide on a teacher application (Approve, Reject, Request Info, Suspend).
 */
export async function decideTeacherApplicationAdmin(
  adminUserId: string,
  applicationId: string,
  decisionInput: TeacherDecisionInput,
  ipAddress?: string
): Promise<{ success: boolean; application?: TeacherApplication; error?: string }> {
  const isAdmin = await checkIsAdmin(adminUserId);
  if (!isAdmin) {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  if (!applicationId) {
    return { success: false, error: "Missing application ID" };
  }

  const { decision, reasonCode, reviewerNotes } = decisionInput;
  const statusMap: Record<TeacherDecisionInput["decision"], TeacherApplicationStatus> = {
    approve: "approved",
    reject: "rejected",
    request_info: "info_requested",
    suspend: "suspended",
  };

  const newStatus = statusMap[decision];
  if (!newStatus) {
    return { success: false, error: `Invalid decision: ${decision}` };
  }

  const now = new Date().toISOString();

  const admin = createAdminClient();
  if (admin) {
    try {
      // 1. Fetch target application
      const { data: targetApp, error: fetchErr } = await admin
        .from("teacher_applications")
        .select("*")
        .eq("id", applicationId)
        .single();

      if (fetchErr || !targetApp) {
        return { success: false, error: "Application not found" };
      }

      const applicantUserId = targetApp.user_id as string;

      // 2. Update application record
      const { data: updatedApp, error: updateErr } = await admin
        .from("teacher_applications")
        .update({
          status: newStatus,
          reviewer_id: adminUserId,
          reviewer_notes: reviewerNotes?.trim() || null,
          decision_reason_code: reasonCode,
          reviewed_at: now,
          updated_at: now,
        })
        .eq("id", applicationId)
        .select()
        .single();

      if (updateErr) {
        return { success: false, error: updateErr.message };
      }

      // 3. Update or create teacher profile and app_roles based on decision
      if (newStatus === "approved") {
        await admin.from("teacher_profiles").upsert({
          user_id: applicantUserId,
          status: "approved",
          application_id: applicationId,
          approved_by: adminUserId,
          verified_at: now,
          updated_at: now,
        });

        // Also sync role in app_roles table
        await admin.from("app_roles").upsert(
          { user_id: applicantUserId, role: "teacher" },
          { onConflict: "user_id,role" }
        );
      } else if (newStatus === "suspended") {
        await admin
          .from("teacher_profiles")
          .update({
            status: "suspended",
            suspended_at: now,
            suspension_reason: reviewerNotes?.trim() || reasonCode,
            updated_at: now,
          })
          .eq("user_id", applicantUserId);
      }

      // 4. Record audit log
      await admin.from("classroom_audit_logs").insert({
        actor_id: adminUserId,
        action: `teacher_application_${newStatus}`,
        target_type: "teacher_application",
        target_id: applicationId,
        details: {
          applicantUserId,
          decision,
          reasonCode,
          reviewerNotes: reviewerNotes?.trim() || null,
        },
        ip_address: ipAddress || null,
      });

      // 5. Dispatch decision notification email to the applicant
      if (newStatus === "approved" || newStatus === "rejected") {
        try {
          const { data: applicantProfile } = await admin
            .from("profiles")
            .select("display_name, email, full_name")
            .eq("id", applicantUserId)
            .maybeSingle();

          const recipientEmail = (targetApp.institution_email as string) || applicantProfile?.email;
          if (recipientEmail) {
            const recipientName = applicantProfile?.full_name || applicantProfile?.display_name || "Educator";
            const siteUrl = resolveSiteUrl();
            const actionUrl = newStatus === "approved" ? `${siteUrl}/classroom` : `${siteUrl}/classroom/teach/apply`;

            void notifyTeacherApplicationDecision({
              recipientEmail,
              recipientName,
              decision: newStatus,
              reviewerNotes: reviewerNotes?.trim() || undefined,
              actionUrl,
            }).catch((err) => console.warn("Failed sending applicant decision notification:", err));
          }
        } catch {
          // Non-blocking notification error
        }
      }

      return {
        success: true,
        application: normalizeApplication(updatedApp as Record<string, unknown>),
      };
    } catch (err) {
      console.warn("Error deciding teacher application:", err);
      return { success: false, error: "Unexpected error during application decision" };
    }
  }

  // Memory fallback for tests
  const idx = memoryApplications.findIndex((a) => a.id === applicationId);
  if (idx === -1) {
    return { success: false, error: "Application not found" };
  }

  const app = memoryApplications[idx];
  app.status = newStatus;
  app.reviewerId = adminUserId;
  app.reviewerNotes = reviewerNotes?.trim();
  app.decisionReasonCode = reasonCode;
  app.reviewedAt = now;
  app.updatedAt = now;

  _setMemoryTeacherAppStatus(app.userId, newStatus);

  if (newStatus === "approved") {
    _setMemoryTeacherProfile(app.userId, {
      userId: app.userId,
      status: "approved",
      applicationId: app.id,
      approvedBy: adminUserId,
      verifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  } else if (newStatus === "suspended") {
    _setMemoryTeacherProfile(app.userId, {
      userId: app.userId,
      status: "suspended",
      applicationId: app.id,
      approvedBy: adminUserId,
      verifiedAt: now,
      suspendedAt: now,
      suspensionReason: reviewerNotes || reasonCode,
      createdAt: now,
      updatedAt: now,
    });
  }

  memoryAuditLogs.push({
    id: `log-${Date.now()}`,
    actorId: adminUserId,
    action: `teacher_application_${newStatus}`,
    targetType: "teacher_application",
    targetId: applicationId,
    details: {
      applicantUserId: app.userId,
      decision,
      reasonCode,
      reviewerNotes: reviewerNotes || null,
    },
    ipAddress,
    createdAt: now,
  });

  return { success: true, application: { ...app } };
}
