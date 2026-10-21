import { describe, it, expect, beforeEach } from "vitest";
import {
  _resetMemoryStores,
  _setMemoryTeacherProfile,
} from "./roles";
import {
  createClassroom,
  getClassroom,
  listUserClassrooms,
  joinClassroomByCode,
  listClassroomRoster,
  removeClassroomMember,
  createClassroomGroup,
  assignStudentToGroup,
  createAssignment,
  listAssignments,
  getAssignment,
  _resetClassroomMemory,
} from "./classroomService";

describe("OutputTracer Classroom — Phase 2: Classrooms, Membership, Groups, and Assignments", () => {
  const teacherA = "teacher-uuid-001";
  const teacherB = "teacher-uuid-002";
  const student1 = "student-uuid-101";
  const student2 = "student-uuid-102";
  const outsider = "student-uuid-999";
  const adminUser = "admin-uuid-000";

  beforeEach(() => {
    _resetMemoryStores();
    _resetClassroomMemory();
    process.env.ADMIN_USER_IDS = adminUser;

    // Set verified teacher profiles
    _setMemoryTeacherProfile(teacherA, {
      userId: teacherA,
      status: "approved",
      verifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    _setMemoryTeacherProfile(teacherB, {
      userId: teacherB,
      status: "approved",
      verifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe("1. Classroom Creation & Permissions", () => {
    it("allows a verified teacher to create a classroom and assigns ownership", async () => {
      const res = await createClassroom(teacherA, {
        name: "CS106B: Programming Abstractions",
        subject: "C++",
        description: "Advanced data structures and algorithmic output tracing",
      });

      expect(res.success).toBe(true);
      expect(res.classroom?.id).toBeDefined();
      expect(res.classroom?.teacherId).toBe(teacherA);
      expect(res.classroom?.name).toBe("CS106B: Programming Abstractions");
      expect(res.classroom?.joinCode).toMatch(/^OT-[A-Z0-9]{7}$/);

      // Verify teacher is listed in teaching classrooms
      const list = await listUserClassrooms(teacherA);
      expect(list.teaching.length).toBe(1);
      expect(list.teaching[0].id).toBe(res.classroom?.id);
    });

    it("prevents an unverified student from creating a classroom", async () => {
      const res = await createClassroom(student1, {
        name: "Unauthorized Classroom",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/verified teacher status required/i);
    });

    it("rejects classroom creation with an empty or invalid name", async () => {
      const res = await createClassroom(teacherA, {
        name: "",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/between 1 and 100 characters/i);
    });
  });

  describe("2. Student Enrollment & Joining", () => {
    let classId: string;
    let joinCode: string;

    beforeEach(async () => {
      const res = await createClassroom(teacherA, {
        name: "C++ Fundamentals",
        subject: "C++",
      });
      classId = res.classroom!.id;
      joinCode = res.classroom!.joinCode;
    });

    it("allows an authenticated student to join via a valid join code", async () => {
      const res = await joinClassroomByCode(student1, joinCode);
      expect(res.success).toBe(true);
      expect(res.classroom?.id).toBe(classId);

      // Check student enrolled list
      const list = await listUserClassrooms(student1);
      expect(list.enrolled.length).toBe(1);
      expect(list.enrolled[0].id).toBe(classId);

      // Check roster
      const roster = await listClassroomRoster(teacherA, classId);
      expect(roster.members?.some((m) => m.userId === student1 && m.role === "student")).toBe(true);
    });

    it("rejects joining with an invalid or nonexistent code", async () => {
      const res = await joinClassroomByCode(student1, "INVALID-CODE");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/invalid classroom code/i);
    });

    it("prevents the instructor from enrolling in their own class as a student", async () => {
      const res = await joinClassroomByCode(teacherA, joinCode);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/instructor of this classroom/i);
    });
  });

  describe("3. Cross-Classroom Access Denial & Security Isolation", () => {
    let classAId: string;
    let classBId: string;

    beforeEach(async () => {
      const resA = await createClassroom(teacherA, { name: "Classroom A" });
      classAId = resA.classroom!.id;
      await joinClassroomByCode(student1, resA.classroom!.joinCode);

      const resB = await createClassroom(teacherB, { name: "Classroom B" });
      classBId = resB.classroom!.id;
      await joinClassroomByCode(student2, resB.classroom!.joinCode);
    });

    it("denies an outside student from viewing another classroom's details", async () => {
      // student1 is in Class A, trying to view Class B
      const access = await getClassroom(student1, classBId);
      expect(access.success).toBe(false);
      expect(access.error).toMatch(/access denied/i);
    });

    it("denies an outside student from viewing another classroom's roster", async () => {
      const roster = await listClassroomRoster(student1, classBId);
      expect(roster.success).toBe(false);
      expect(roster.error).toMatch(/access denied/i);
    });

    it("prevents Teacher A from creating an assignment in Teacher B's classroom", async () => {
      const res = await createAssignment(teacherA, classBId, {
        title: "Malicious Assignment",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/access denied|teacher privileges required/i);
    });

    it("prevents Teacher A from removing students in Teacher B's classroom", async () => {
      const res = await removeClassroomMember(teacherA, classBId, student2);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/access denied|teacher privileges required/i);
    });

    it("prevents a student from removing peer students from the roster", async () => {
      const res = await removeClassroomMember(student1, classAId, student1);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/teacher privileges required/i);
    });

    it("prevents removing the instructor from their classroom", async () => {
      const res = await removeClassroomMember(teacherA, classAId, teacherA);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cannot remove the classroom instructor/i);
    });
  });

  describe("4. Group Management", () => {
    let classId: string;
    let studentIdEnrolled: string;

    beforeEach(async () => {
      const res = await createClassroom(teacherA, { name: "Lab Section" });
      classId = res.classroom!.id;
      studentIdEnrolled = student1;
      await joinClassroomByCode(studentIdEnrolled, res.classroom!.joinCode);
    });

    it("allows the teacher to create groups", async () => {
      const res = await createClassroomGroup(teacherA, classId, "Group 1: Compilers");
      expect(res.success).toBe(true);
      expect(res.group?.name).toBe("Group 1: Compilers");
    });

    it("allows the teacher to assign an enrolled student to a group", async () => {
      const groupRes = await createClassroomGroup(teacherA, classId, "Group Alpha");
      const assignRes = await assignStudentToGroup(teacherA, classId, groupRes.group!.id, studentIdEnrolled);
      expect(assignRes.success).toBe(true);
    });

    it("prevents assigning a non-enrolled student to a group", async () => {
      const groupRes = await createClassroomGroup(teacherA, classId, "Group Beta");
      const assignRes = await assignStudentToGroup(teacherA, classId, groupRes.group!.id, outsider);
      expect(assignRes.success).toBe(false);
      expect(assignRes.error).toMatch(/not enrolled in this classroom/i);
    });

    it("prevents a student from creating a group", async () => {
      const res = await createClassroomGroup(studentIdEnrolled, classId, "Student Group");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/teacher privileges required/i);
    });
  });

  describe("5. Assignments & Privacy Protection", () => {
    let classId: string;
    let publishedId: string;
    let draftId: string;

    beforeEach(async () => {
      const res = await createClassroom(teacherA, { name: "Data Structures" });
      classId = res.classroom!.id;
      await joinClassroomByCode(student1, res.classroom!.joinCode);

      // Create published assignment with public and hidden test cases
      const pub = await createAssignment(teacherA, classId, {
        title: "Assignment 1: Linked List Tracer",
        description: "Implement reverse() and print elements.",
        publicTestCases: [
          { id: "tc-pub-1", name: "Empty list", stdin: "", expectedOutput: "0", points: 20 },
        ],
        hiddenTestCases: [
          { id: "tc-hid-1", name: "10,000 nodes stress", stdin: "10000", expectedOutput: "OK", points: 80, isHidden: true },
        ],
        isPublished: true,
        maxPoints: 100,
      });
      publishedId = pub.assignment!.id;

      // Create draft assignment
      const draft = await createAssignment(teacherA, classId, {
        title: "Assignment 2: Red-Black Trees (Draft)",
        isPublished: false,
      });
      draftId = draft.assignment!.id;
    });

    it("allows enrolled students to list published assignments but hides unpublished drafts", async () => {
      const studentList = await listAssignments(student1, classId);
      expect(studentList.success).toBe(true);
      expect(studentList.assignments?.length).toBe(1);
      expect(studentList.assignments?.[0].id).toBe(publishedId);

      // Teacher sees both published and draft
      const teacherList = await listAssignments(teacherA, classId);
      expect(teacherList.assignments?.length).toBe(2);
    });

    it("strictly strips hidden test cases from student-facing responses", async () => {
      const studentView = await getAssignment(student1, classId, publishedId);
      expect(studentView.success).toBe(true);
      expect(studentView.assignment?.publicTestCases.length).toBe(1);
      // Hidden test cases must be undefined for student
      expect(studentView.assignment?.hiddenTestCases).toBeUndefined();

      // Teacher view retains hidden test cases
      const teacherView = await getAssignment(teacherA, classId, publishedId);
      expect(teacherView.assignment?.hiddenTestCases).toBeDefined();
      expect(teacherView.assignment?.hiddenTestCases?.length).toBe(1);
    });

    it("prevents an enrolled student from directly fetching an unpublished draft assignment", async () => {
      const studentView = await getAssignment(student1, classId, draftId);
      expect(studentView.success).toBe(false);
      expect(studentView.error).toMatch(/not published yet/i);
    });

    it("prevents an outside student from accessing any assignments", async () => {
      const res = await listAssignments(outsider, classId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/access denied/i);
    });
  });
});
