import { describe, it, expect, beforeEach } from "vitest";
import {
  checkIsVerifiedTeacher,
  checkCanManageClassroom,
  getUserCapabilities,
  _resetMemoryStores,
  _setMemoryTeacherProfile,
  _setMemoryTeacherAppStatus,
} from "./roles";
import {
  submitTeacherApplication,
  activateSelfServiceTeacher,
  listTeacherApplicationsAdmin,
  decideTeacherApplicationAdmin,
  _resetTeacherServiceMemory,
  _getMemoryAuditLogs,
  _addMemoryApplication,
} from "./teacherService";
import { TeacherApplication } from "./types";

describe("OutputTracer Classroom — Roles, Authorization & Self-Service Teacher Onboarding", () => {
  const studentId = "student-uuid-001";
  const applicantId = "applicant-uuid-002";
  const teacherId = "teacher-uuid-003";
  const otherTeacherId = "teacher-uuid-004";
  const adminId = "admin-uuid-005";

  beforeEach(() => {
    _resetMemoryStores();
    _resetTeacherServiceMemory();
    process.env.ADMIN_USER_IDS = adminId;
  });

  describe("1. Role & Capability Foundation", () => {
    it("treats a normal student as unverified with no classroom creation privileges", async () => {
      const isTeacher = await checkIsVerifiedTeacher(studentId);
      expect(isTeacher).toBe(false);

      const caps = await getUserCapabilities(studentId);
      expect(caps.isAuthenticated).toBe(true);
      expect(caps.isAdmin).toBe(false);
      expect(caps.isVerifiedTeacher).toBe(false);
      expect(caps.canCreateClassroom).toBe(false);
      expect(caps.teacherApplicationStatus).toBe("none");
    });

    it("does not grant teacher privileges to an unverified applicant with a pending application", async () => {
      _setMemoryTeacherAppStatus(applicantId, "pending_review");

      const isTeacher = await checkIsVerifiedTeacher(applicantId);
      expect(isTeacher).toBe(false);

      const caps = await getUserCapabilities(applicantId);
      expect(caps.isVerifiedTeacher).toBe(false);
      expect(caps.canCreateClassroom).toBe(false);
      expect(caps.teacherApplicationStatus).toBe("pending_review");
    });

    it("recognizes an approved verified teacher and allows classroom creation", async () => {
      _setMemoryTeacherProfile(teacherId, {
        userId: teacherId,
        status: "approved",
        verifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      _setMemoryTeacherAppStatus(teacherId, "approved");

      const isTeacher = await checkIsVerifiedTeacher(teacherId);
      expect(isTeacher).toBe(true);

      const caps = await getUserCapabilities(teacherId);
      expect(caps.isVerifiedTeacher).toBe(true);
      expect(caps.canCreateClassroom).toBe(true);
      expect(caps.teacherApplicationStatus).toBe("approved");
    });

    it("revokes classroom creation privileges if a teacher is suspended", async () => {
      _setMemoryTeacherProfile(teacherId, {
        userId: teacherId,
        status: "suspended",
        verifiedAt: new Date().toISOString(),
        suspendedAt: new Date().toISOString(),
        suspensionReason: "Policy review",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const isTeacher = await checkIsVerifiedTeacher(teacherId);
      expect(isTeacher).toBe(false);

      const caps = await getUserCapabilities(teacherId);
      expect(caps.isVerifiedTeacher).toBe(false);
      expect(caps.canCreateClassroom).toBe(false);
    });

    it("grants platform administrators full management capability", async () => {
      const caps = await getUserCapabilities(adminId);
      expect(caps.isAdmin).toBe(true);
      expect(caps.canCreateClassroom).toBe(true);
    });
  });

  describe("2. Classroom Management Isolation", () => {
    beforeEach(() => {
      _setMemoryTeacherProfile(teacherId, {
        userId: teacherId,
        status: "approved",
        verifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      _setMemoryTeacherProfile(otherTeacherId, {
        userId: otherTeacherId,
        status: "approved",
        verifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    it("allows a teacher to manage their own classroom", async () => {
      const canManage = await checkCanManageClassroom(teacherId, teacherId);
      expect(canManage).toBe(true);
    });

    it("prevents a teacher from managing another teacher's classroom", async () => {
      const canManage = await checkCanManageClassroom(teacherId, otherTeacherId);
      expect(canManage).toBe(false);
    });

    it("prevents a student from managing any classroom", async () => {
      const canManage = await checkCanManageClassroom(studentId, teacherId);
      expect(canManage).toBe(false);
    });

    it("allows an admin to manage any classroom for support/audit purposes", async () => {
      const canManage = await checkCanManageClassroom(adminId, teacherId);
      expect(canManage).toBe(true);
    });
  });

  describe("3. Self-Service Teacher Onboarding & Validation", () => {
    it("rejects applications with invalid or missing institution name", async () => {
      const res = await submitTeacherApplication(studentId, {
        institutionName: "A", // too short
        evidenceNotes: "Teaching CS 101 at University",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/between 2 and 160/i);
    });

    it("rejects applications with insufficient evidence notes", async () => {
      const res = await submitTeacherApplication(studentId, {
        institutionName: "MIT",
        evidenceNotes: "hi", // too short
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/between 5 and 2000/i);
    });

    it("rejects invalid email formats", async () => {
      const res = await submitTeacherApplication(studentId, {
        institutionName: "Stanford University",
        institutionEmail: "not-an-email",
        evidenceNotes: "Faculty directory URL: https://example.edu/staff/john",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/invalid institutional email/i);
    });

    it("allows saving a draft application without granting teacher privileges", async () => {
      const res = await submitTeacherApplication(studentId, {
        institutionName: "Stanford University",
        institutionEmail: "prof@stanford.edu",
        department: "Computer Science",
        coursesIntended: "CS106B C++ Data Structures",
        evidenceNotes: "Draft notes for instructor profile",
        isDraft: true,
      });

      expect(res.success).toBe(true);
      expect(res.application?.status).toBe("draft");

      const isTeacher = await checkIsVerifiedTeacher(studentId);
      expect(isTeacher).toBe(false);

      const caps = await getUserCapabilities(studentId);
      expect(caps.isVerifiedTeacher).toBe(false);
      expect(caps.canCreateClassroom).toBe(false);
    });

    it("immediately activates teacher profile upon submission (self-service) without waiting for admin approval", async () => {
      const res = await submitTeacherApplication(studentId, {
        institutionName: "Stanford University",
        institutionEmail: "prof@stanford.edu",
        department: "Computer Science",
        coursesIntended: "CS106B C++ Data Structures",
        evidenceNotes: "Department faculty directory: https://cs.stanford.edu/people/prof",
      });

      expect(res.success).toBe(true);
      expect(res.application?.status).toBe("approved");
      expect(res.application?.institutionName).toBe("Stanford University");

      // Verify the user is immediately an approved teacher
      const isTeacher = await checkIsVerifiedTeacher(studentId);
      expect(isTeacher).toBe(true);

      const caps = await getUserCapabilities(studentId);
      expect(caps.isVerifiedTeacher).toBe(true);
      expect(caps.canCreateClassroom).toBe(true);
      expect(caps.isAdmin).toBe(false); // Strictly no admin privilege escalation

      const logs = _getMemoryAuditLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].actorId).toBe(studentId);
      expect(logs[0].action).toBe("teacher_self_service_activated");
      expect(logs[0].targetId).toBe(res.application?.id);
    });

    it("supports 1-click self-service activation via activateSelfServiceTeacher", async () => {
      const res = await activateSelfServiceTeacher(applicantId, "Berkeley College");
      expect(res.success).toBe(true);
      expect(res.application?.status).toBe("approved");

      const isTeacher = await checkIsVerifiedTeacher(applicantId);
      expect(isTeacher).toBe(true);

      const caps = await getUserCapabilities(applicantId);
      expect(caps.canCreateClassroom).toBe(true);
      expect(caps.isAdmin).toBe(false);
    });

    it("prevents duplicate submission once already approved", async () => {
      await activateSelfServiceTeacher(studentId, "MIT");

      const duplicate = await submitTeacherApplication(studentId, {
        institutionName: "Harvard",
        evidenceNotes: "Another application attempt",
      });

      expect(duplicate.success).toBe(false);
      expect(duplicate.error).toMatch(/already an approved teacher/i);
    });

    it("prevents a suspended teacher from bypassing suspension via self-service activation", async () => {
      _setMemoryTeacherProfile(studentId, {
        userId: studentId,
        status: "suspended",
        verifiedAt: new Date().toISOString(),
        suspendedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await activateSelfServiceTeacher(studentId, "Reactivation School");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/suspended/i);

      expect(await checkIsVerifiedTeacher(studentId)).toBe(false);
    });
  });

  describe("4. Administrative Review & Privilege Escalation Prevention", () => {
    let pendingAppId: string;

    beforeEach(() => {
      pendingAppId = `app-pending-${Date.now()}`;
      const pendingApp: TeacherApplication = {
        id: pendingAppId,
        userId: applicantId,
        status: "pending_review",
        institutionName: "UC Berkeley",
        institutionEmail: "lecturer@berkeley.edu",
        evidenceNotes: "CS 61A Lecturer profile: https://eecs.berkeley.edu",
        submittedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      _addMemoryApplication(pendingApp);
      _setMemoryTeacherAppStatus(applicantId, "pending_review");
    });

    it("denies non-admin users from listing teacher applications", async () => {
      const res = await listTeacherApplicationsAdmin(studentId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/admin privileges required/i);
    });

    it("denies non-admin users from deciding or approving applications", async () => {
      const res = await decideTeacherApplicationAdmin(studentId, pendingAppId, {
        decision: "approve",
        reasonCode: "verified_credentials",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/admin privileges required/i);

      // Verify the applicant was NOT approved
      const isTeacher = await checkIsVerifiedTeacher(applicantId);
      expect(isTeacher).toBe(false);
    });

    it("allows verified administrator to approve an applicant and transitions them to teacher", async () => {
      const res = await decideTeacherApplicationAdmin(adminId, pendingAppId, {
        decision: "approve",
        reasonCode: "verified_credentials",
        reviewerNotes: "Verified via official faculty directory.",
      });

      expect(res.success).toBe(true);
      expect(res.application?.status).toBe("approved");
      expect(res.application?.reviewerId).toBe(adminId);

      // Applicant is now an active, verified teacher
      const isTeacher = await checkIsVerifiedTeacher(applicantId);
      expect(isTeacher).toBe(true);

      const caps = await getUserCapabilities(applicantId);
      expect(caps.isVerifiedTeacher).toBe(true);
      expect(caps.canCreateClassroom).toBe(true);

      // Verify immutable audit log recorded
      const logs = _getMemoryAuditLogs();
      const approvalLog = logs.find((l) => l.action === "teacher_application_approved");
      expect(approvalLog).toBeDefined();
      expect(approvalLog?.actorId).toBe(adminId);
      expect(approvalLog?.details.applicantUserId).toBe(applicantId);
    });

    it("allows administrator to request additional info and prevents premature verification", async () => {
      const res = await decideTeacherApplicationAdmin(adminId, pendingAppId, {
        decision: "request_info",
        reasonCode: "insufficient_evidence",
        reviewerNotes: "Please provide your institutional email address.",
      });

      expect(res.success).toBe(true);
      expect(res.application?.status).toBe("info_requested");

      const isTeacher = await checkIsVerifiedTeacher(applicantId);
      expect(isTeacher).toBe(false);
    });

    it("allows administrator to suspend a previously verified teacher", async () => {
      // First approve
      await decideTeacherApplicationAdmin(adminId, pendingAppId, {
        decision: "approve",
        reasonCode: "verified_credentials",
      });
      expect(await checkIsVerifiedTeacher(applicantId)).toBe(true);

      // Then suspend
      const suspendRes = await decideTeacherApplicationAdmin(adminId, pendingAppId, {
        decision: "suspend",
        reasonCode: "policy_violation",
        reviewerNotes: "Investigation into classroom conduct.",
      });

      expect(suspendRes.success).toBe(true);
      expect(await checkIsVerifiedTeacher(applicantId)).toBe(false);
    });
  });

  describe("5. Strict Privilege Escalation Isolation", () => {
    it("ensures that self-service teacher onboarding never elevates user to admin", async () => {
      await activateSelfServiceTeacher(studentId, "Public High School");

      const caps = await getUserCapabilities(studentId);
      expect(caps.isVerifiedTeacher).toBe(true);
      expect(caps.canCreateClassroom).toBe(true);
      expect(caps.isAdmin).toBe(false); // STRICT ISOLATION

      // Teacher cannot access admin endpoints
      const adminAppsRes = await listTeacherApplicationsAdmin(studentId);
      expect(adminAppsRes.success).toBe(false);
      expect(adminAppsRes.error).toMatch(/admin privileges required/i);
    });
  });
});
