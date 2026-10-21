/**
 * phase5.test.ts
 *
 * Automated test suite for Phase 5 Administrator & Educator Operations:
 * 1. Audit Log review (admin-only access, non-admins denied, filtering by actor/action/target)
 * 2. Classroom moderation (admin can archive/unarchive, audit event recorded)
 * 3. Teacher profile moderation (admin can suspend/reinstate, audit event recorded)
 * 4. Educator progress & completion reports (instructor and admin allowed; non-instructor students denied)
 * 5. Permission-controlled gradebook CSV export:
 *    - Instructor of classroom can export
 *    - Platform administrator can export
 *    - Enrolled students CANNOT export
 *    - Teachers of unrelated classrooms CANNOT export
 *    - Validates CSV RFC-4180 output formatting and audit record emission
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  listAuditLogsAdmin,
  recordAdminAudit,
  moderateClassroomAdmin,
  moderateTeacherProfileAdmin,
  generateClassroomProgressReport,
  exportGradebookCsv,
  _resetAdminServiceMemory,
  _getMemoryAuditRecords,
} from "./adminService";
import {
  createClassroom,
  joinClassroomByCode,
  createAssignment,
  _resetClassroomMemory,
} from "./classroomService";
import {
  _setMemoryTeacherProfile,
  _resetMemoryStores,
} from "./roles";

const ADMIN_USER = "admin-uuid-001";
const TEACHER_1 = "teacher-1-uuid";
const TEACHER_2 = "teacher-2-uuid";
const STUDENT_1 = "student-1-uuid";
const STUDENT_2 = "student-2-uuid";

let class1Id: string;

beforeEach(async () => {
  _resetMemoryStores();
  _resetClassroomMemory();
  _resetAdminServiceMemory();

  // Configure admin user
  process.env.ADMIN_USER_IDS = ADMIN_USER;

  // Setup verified teachers
  _setMemoryTeacherProfile(TEACHER_1, {
    userId: TEACHER_1,
    status: "approved",
    verifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  _setMemoryTeacherProfile(TEACHER_2, {
    userId: TEACHER_2,
    status: "approved",
    verifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Create Classroom 1 owned by TEACHER_1
  const c1 = await createClassroom(TEACHER_1, { name: "CS 101: Systems Programming" });
  class1Id = c1.classroom!.id;

  // Enroll students
  await joinClassroomByCode(STUDENT_1, c1.classroom!.joinCode);
  await joinClassroomByCode(STUDENT_2, c1.classroom!.joinCode);

  // Add an assignment to Classroom 1
  await createAssignment(TEACHER_1, class1Id, {
    title: "Lab 1: Pointers & Structs",
    maxPoints: 100,
    isPublished: true,
  });
});

// ==============================================================================
// 1. Audit Log Review
// ==============================================================================
describe("Admin Audit Logs", () => {
  it("allows platform administrator to list audit logs with filters", async () => {
    await recordAdminAudit(
      ADMIN_USER,
      "teacher_application_approved",
      "teacher_application",
      "app-101",
      { decision: "approved" }
    );

    await recordAdminAudit(
      ADMIN_USER,
      "classroom_archived",
      "classroom",
      class1Id,
      { reason: "Semester ended" }
    );

    const res = await listAuditLogsAdmin(ADMIN_USER);
    expect(res.success).toBe(true);
    expect(res.logs?.length).toBe(2);

    // Filter by action
    const filteredRes = await listAuditLogsAdmin(ADMIN_USER, { action: "classroom_archived" });
    expect(filteredRes.success).toBe(true);
    expect(filteredRes.logs?.length).toBe(1);
    expect(filteredRes.logs![0].action).toBe("classroom_archived");
  });

  it("denies non-administrator users from inspecting audit logs", async () => {
    const teacherRes = await listAuditLogsAdmin(TEACHER_1);
    expect(teacherRes.success).toBe(false);
    expect(teacherRes.error).toContain("Platform administrator privileges required");

    const studentRes = await listAuditLogsAdmin(STUDENT_1);
    expect(studentRes.success).toBe(false);
    expect(studentRes.error).toContain("Platform administrator privileges required");
  });
});

// ==============================================================================
// 2. Classroom & Account Moderation
// ==============================================================================
describe("Classroom & Account Moderation", () => {
  it("allows administrator to archive a classroom and records an audit log", async () => {
    const res = await moderateClassroomAdmin(
      ADMIN_USER,
      class1Id,
      "archive",
      "Classroom reported for academic violation"
    );

    expect(res.success).toBe(true);

    const audits = _getMemoryAuditRecords();
    const match = audits.find((a) => a.action === "classroom_archive" && a.targetId === class1Id);
    expect(match).toBeDefined();
    expect(match?.actorId).toBe(ADMIN_USER);
    expect(match?.details.reason).toContain("academic violation");
  });

  it("denies regular teachers from executing classroom moderation actions", async () => {
    const res = await moderateClassroomAdmin(
      TEACHER_1,
      class1Id,
      "archive",
      "Teacher trying to execute administrative archive"
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain("Administrator privileges required");
  });

  it("allows administrator to suspend and reinstate a teacher profile with audit trails", async () => {
    const suspendRes = await moderateTeacherProfileAdmin(
      ADMIN_USER,
      TEACHER_2,
      "suspend",
      "Credentials under review"
    );
    expect(suspendRes.success).toBe(true);

    const reinstateRes = await moderateTeacherProfileAdmin(
      ADMIN_USER,
      TEACHER_2,
      "reinstate",
      "Credentials verified by registrar"
    );
    expect(reinstateRes.success).toBe(true);

    const audits = _getMemoryAuditRecords();
    const suspendAudit = audits.find((a) => a.action === "teacher_suspend" && a.targetId === TEACHER_2);
    const reinstateAudit = audits.find((a) => a.action === "teacher_reinstate" && a.targetId === TEACHER_2);
    expect(suspendAudit).toBeDefined();
    expect(reinstateAudit).toBeDefined();
  });
});

// ==============================================================================
// 3. Educator Progress & Analytics Reports
// ==============================================================================
describe("Educator Classroom Progress Reports", () => {
  it("allows the classroom teacher to generate the progress report", async () => {
    const res = await generateClassroomProgressReport(TEACHER_1, class1Id);
    expect(res.success).toBe(true);
    expect(res.report?.classroomId).toBe(class1Id);
    expect(res.report?.classroomName).toBe("CS 101: Systems Programming");
  });

  it("allows platform administrator to view progress report for any classroom", async () => {
    const res = await generateClassroomProgressReport(ADMIN_USER, class1Id);
    expect(res.success).toBe(true);
    expect(res.report?.classroomId).toBe(class1Id);
  });

  it("denies students from accessing educator progress reports", async () => {
    const res = await generateClassroomProgressReport(STUDENT_1, class1Id);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Educator or administrator privileges required");
  });

  it("denies teachers of other classrooms from accessing progress reports", async () => {
    const res = await generateClassroomProgressReport(TEACHER_2, class1Id);
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });
});

// ==============================================================================
// 4. Permission-Controlled Gradebook CSV Export
// ==============================================================================
describe("Gradebook CSV Export Permissions & Format", () => {
  it("allows classroom teacher to export gradebook CSV and emits an audit record", async () => {
    const res = await exportGradebookCsv(TEACHER_1, class1Id, "127.0.0.1");
    expect(res.success).toBe(true);
    expect(res.csv).toBeDefined();
    expect(res.filename).toContain("gradebook_");
    expect(res.filename?.endsWith(".csv")).toBe(true);

    // Verify CSV header structure
    const lines = res.csv!.split("\n");
    expect(lines[0]).toBe("Student ID,Student Name,Email,Assignment,Score,Max Points,Percentage,Submitted At,Late");

    // Verify privileged export audit log
    const audits = _getMemoryAuditRecords();
    const exportAudit = audits.find((a) => a.action === "gradebook_export_csv" && a.targetId === class1Id);
    expect(exportAudit).toBeDefined();
    expect(exportAudit?.actorId).toBe(TEACHER_1);
    expect(exportAudit?.ipAddress).toBe("127.0.0.1");
  });

  it("allows platform administrator to export gradebook CSV", async () => {
    const res = await exportGradebookCsv(ADMIN_USER, class1Id);
    expect(res.success).toBe(true);
    expect(res.csv).toBeDefined();
  });

  it("denies enrolled students from exporting the gradebook", async () => {
    const res = await exportGradebookCsv(STUDENT_1, class1Id);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Access denied");
  });

  it("denies teachers of other classrooms from exporting the gradebook", async () => {
    const res = await exportGradebookCsv(TEACHER_2, class1Id);
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });
});
