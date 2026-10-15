import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/learn/db";
import {
  checkIsVerifiedTeacher,
  checkCanManageClassroom,
} from "./roles";
import {
  Classroom,
  ClassroomRole,
  ClassroomMember,
  ClassroomGroup,
  ClassroomAssignment,
  AssignmentTestCase,
  CreateClassroomInput,
  CreateAssignmentInput,
} from "./types";

// In-memory fallback stores for tests and offline development
const memoryClassrooms = new Map<string, Classroom>();
const memoryMembers = new Map<string, ClassroomMember[]>(); // classroomId -> members
const memoryGroups = new Map<string, ClassroomGroup[]>(); // classroomId -> groups
const memoryGroupMembers = new Map<string, Set<string>>(); // groupId -> set of userIds
const memoryAssignments = new Map<string, ClassroomAssignment[]>(); // classroomId -> assignments

export function _resetClassroomMemory(): void {
  memoryClassrooms.clear();
  memoryMembers.clear();
  memoryGroups.clear();
  memoryGroupMembers.clear();
  memoryAssignments.clear();
}

function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 7; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `OT-${code}`;
}

function normalizeClassroom(row: Record<string, unknown>): Classroom {
  return {
    id: String(row.id),
    teacherId: String(row.teacher_id),
    name: String(row.name),
    subject: String(row.subject || "Computer Science"),
    description: String(row.description || ""),
    joinCode: String(row.join_code),
    isArchived: Boolean(row.is_archived),
    settings: (row.settings as Classroom["settings"]) || {
      allowStudentDiscussions: true,
      requireApprovalToJoin: false,
    },
    memberCount: typeof row.member_count === "number" ? row.member_count : undefined,
    assignmentCount: typeof row.assignment_count === "number" ? row.assignment_count : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * 1. Create a Classroom (Verified Teachers only)
 */
export async function createClassroom(
  teacherId: string,
  input: CreateClassroomInput
): Promise<{ success: boolean; classroom?: Classroom; error?: string }> {
  if (!teacherId) {
    return { success: false, error: "Authentication required" };
  }

  // Strict authorization: Only verified teachers or platform admins
  const [isTeacher, isAdmin] = await Promise.all([
    checkIsVerifiedTeacher(teacherId),
    checkIsAdmin(teacherId),
  ]);

  if (!isTeacher && !isAdmin) {
    return { success: false, error: "Unauthorized. Verified teacher status required to create a classroom." };
  }

  const name = (input.name || "").trim();
  if (name.length < 1 || name.length > 100) {
    return { success: false, error: "Classroom name must be between 1 and 100 characters" };
  }

  const subject = (input.subject || "Computer Science").trim();
  const description = (input.description || "").trim();
  const joinCode = generateJoinCode();
  const now = new Date().toISOString();

  const admin = createAdminClient();
  if (admin) {
    try {
      const { data: classRow, error: classErr } = await admin
        .from("classrooms")
        .insert({
          teacher_id: teacherId,
          name,
          subject,
          description,
          join_code: joinCode,
          is_archived: false,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (classErr) {
        return { success: false, error: classErr.message };
      }

      const classroom = normalizeClassroom(classRow as Record<string, unknown>);

      // Add teacher as owner in members
      await admin.from("classroom_members").insert({
        classroom_id: classroom.id,
        user_id: teacherId,
        role: "teacher",
        joined_at: now,
      });

      return { success: true, classroom };
    } catch (err) {
      console.warn("Database error creating classroom:", err);
      return { success: false, error: "Could not create classroom" };
    }
  }

  // Memory fallback
  const newClass: Classroom = {
    id: `cls-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    teacherId,
    name,
    subject,
    description,
    joinCode,
    isArchived: false,
    settings: {
      allowStudentDiscussions: true,
      requireApprovalToJoin: false,
    },
    memberCount: 1,
    assignmentCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  memoryClassrooms.set(newClass.id, newClass);
  memoryMembers.set(newClass.id, [
    {
      classroomId: newClass.id,
      userId: teacherId,
      role: "teacher",
      joinedAt: now,
    },
  ]);

  return { success: true, classroom: newClass };
}

/**
 * 2. Get Classroom by ID (Enforces Membership or Admin)
 */
export async function getClassroom(
  userId: string,
  classroomId: string
): Promise<{ success: boolean; classroom?: Classroom; isTeacher?: boolean; error?: string }> {
  if (!userId || !classroomId) {
    return { success: false, error: "Invalid request parameters" };
  }

  const isAdmin = await checkIsAdmin(userId);

  const admin = createAdminClient();
  if (admin) {
    try {
      const { data: classRow, error } = await admin
        .from("classrooms")
        .select("*")
        .eq("id", classroomId)
        .single();

      if (error || !classRow) {
        return { success: false, error: "Classroom not found" };
      }

      const classroom = normalizeClassroom(classRow as Record<string, unknown>);
      const isOwner = classroom.teacherId === userId;

      if (!isAdmin && !isOwner) {
        // Check if caller is an enrolled student member
        const { data: member } = await admin
          .from("classroom_members")
          .select("role")
          .eq("classroom_id", classroomId)
          .eq("user_id", userId)
          .maybeSingle();

        if (!member) {
          return { success: false, error: "Access denied. You are not enrolled in this classroom." };
        }
      }

      return {
        success: true,
        classroom,
        isTeacher: isOwner || isAdmin,
      };
    } catch {
      // Memory fallback below
    }
  }

  const classroom = memoryClassrooms.get(classroomId);
  if (!classroom) {
    return { success: false, error: "Classroom not found" };
  }

  const members = memoryMembers.get(classroomId) || [];
  const member = members.find((m) => m.userId === userId);
  const isOwner = classroom.teacherId === userId;

  if (!isAdmin && !isOwner && !member) {
    return { success: false, error: "Access denied. You are not enrolled in this classroom." };
  }

  return {
    success: true,
    classroom: {
      ...classroom,
      memberCount: members.length,
      assignmentCount: (memoryAssignments.get(classroomId) || []).length,
    },
    isTeacher: isOwner || isAdmin,
  };
}

/**
 * 3. List Classrooms for Current User
 */
export async function listUserClassrooms(
  userId: string
): Promise<{
  success: boolean;
  teaching: Classroom[];
  enrolled: Classroom[];
  error?: string;
}> {
  if (!userId) {
    return { success: false, teaching: [], enrolled: [], error: "Authentication required" };
  }

  const admin = createAdminClient();
  if (admin) {
    try {
      const [teachingRes, enrolledRes] = await Promise.all([
        admin.from("classrooms").select("*").eq("teacher_id", userId).eq("is_archived", false),
        admin
          .from("classroom_members")
          .select("classrooms(*)")
          .eq("user_id", userId)
          .eq("role", "student"),
      ]);

      const teaching = (teachingRes.data || []).map((r) => normalizeClassroom(r as Record<string, unknown>));
      const enrolled: Classroom[] = [];
      for (const row of enrolledRes.data || []) {
        if (row.classrooms) {
          enrolled.push(normalizeClassroom(row.classrooms as unknown as Record<string, unknown>));
        }
      }

      return { success: true, teaching, enrolled };
    } catch {
      // Memory fallback below
    }
  }

  const teaching: Classroom[] = [];
  const enrolled: Classroom[] = [];

  for (const c of memoryClassrooms.values()) {
    if (c.isArchived) continue;
    if (c.teacherId === userId) {
      teaching.push(c);
      continue;
    }
    const members = memoryMembers.get(c.id) || [];
    if (members.some((m) => m.userId === userId && m.role === "student")) {
      enrolled.push(c);
    }
  }

  return { success: true, teaching, enrolled };
}

/**
 * 4. Join Classroom by Code
 */
export async function joinClassroomByCode(
  userId: string,
  joinCode: string
): Promise<{ success: boolean; classroom?: Classroom; error?: string }> {
  if (!userId) {
    return { success: false, error: "Authentication required" };
  }

  const cleanCode = (joinCode || "").trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, error: "Classroom code is required" };
  }

  const now = new Date().toISOString();

  const admin = createAdminClient();
  if (admin) {
    try {
      const { data: classRow, error: findErr } = await admin
        .from("classrooms")
        .select("*")
        .eq("join_code", cleanCode)
        .eq("is_archived", false)
        .maybeSingle();

      if (findErr || !classRow) {
        return { success: false, error: "Invalid classroom code or classroom is archived" };
      }

      const classroom = normalizeClassroom(classRow as Record<string, unknown>);

      // Prevent teacher joining their own class as student
      if (classroom.teacherId === userId) {
        return { success: false, error: "You are the instructor of this classroom" };
      }

      // Check if already enrolled
      const { data: existing } = await admin
        .from("classroom_members")
        .select("role")
        .eq("classroom_id", classroom.id)
        .eq("user_id", userId)
        .maybeSingle();

      if (existing) {
        return { success: true, classroom }; // Already enrolled
      }

      // Enroll as student
      await admin.from("classroom_members").insert({
        classroom_id: classroom.id,
        user_id: userId,
        role: "student",
        joined_at: now,
      });

      return { success: true, classroom };
    } catch (err) {
      console.warn("Database error joining classroom:", err);
      return { success: false, error: "Failed to join classroom" };
    }
  }

  // Memory fallback
  const found = Array.from(memoryClassrooms.values()).find(
    (c) => c.joinCode.toUpperCase() === cleanCode && !c.isArchived
  );

  if (!found) {
    return { success: false, error: "Invalid classroom code or classroom is archived" };
  }

  if (found.teacherId === userId) {
    return { success: false, error: "You are the instructor of this classroom" };
  }

  const members = memoryMembers.get(found.id) || [];
  if (members.some((m) => m.userId === userId)) {
    return { success: true, classroom: found };
  }

  members.push({
    classroomId: found.id,
    userId,
    role: "student",
    joinedAt: now,
  });
  memoryMembers.set(found.id, members);
  found.memberCount = members.length;

  return { success: true, classroom: found };
}

/**
 * 5. List Classroom Roster
 */
export async function listClassroomRoster(
  userId: string,
  classroomId: string
): Promise<{ success: boolean; members?: ClassroomMember[]; error?: string }> {
  const access = await getClassroom(userId, classroomId);
  if (!access.success) {
    return { success: false, error: access.error };
  }

  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_members")
        .select("classroom_id, user_id, role, joined_at, profiles(display_name, email)")
        .eq("classroom_id", classroomId)
        .order("joined_at", { ascending: true });

      if (!error && data) {
        // Supabase returns joined relations as arrays; profiles is { display_name?, email? }[]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const roster: ClassroomMember[] = (data as any[]).map((r) => {
          const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          return {
            classroomId: r.classroom_id as string,
            userId: r.user_id as string,
            role: r.role as ClassroomRole,
            joinedAt: r.joined_at as string,
            displayName: profile?.display_name ?? undefined,
            email: access.isTeacher ? (profile?.email ?? undefined) : undefined,
          };
        });
        return { success: true, members: roster };
      }
    } catch {
      // Memory fallback below
    }
  }

  const members = memoryMembers.get(classroomId) || [];
  return { success: true, members };
}

/**
 * 6. Remove Member from Classroom (Teacher only)
 */
export async function removeClassroomMember(
  actorUserId: string,
  classroomId: string,
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  const access = await getClassroom(actorUserId, classroomId);
  if (!access.success || !access.classroom) {
    return { success: false, error: access.error || "Classroom not found" };
  }

  const canManage = await checkCanManageClassroom(actorUserId, access.classroom.teacherId);
  if (!canManage) {
    return { success: false, error: "Unauthorized. Teacher privileges required." };
  }

  if (targetUserId === access.classroom.teacherId) {
    return { success: false, error: "Cannot remove the classroom instructor" };
  }

  const admin = createAdminClient();
  if (admin) {
    try {
      await admin
        .from("classroom_members")
        .delete()
        .eq("classroom_id", classroomId)
        .eq("user_id", targetUserId);
      return { success: true };
    } catch {
      // Memory fallback below
    }
  }

  const members = memoryMembers.get(classroomId) || [];
  memoryMembers.set(
    classroomId,
    members.filter((m) => m.userId !== targetUserId)
  );
  return { success: true };
}

/**
 * 7. Group Management (Create Group & Assign Members)
 */
export async function createClassroomGroup(
  actorUserId: string,
  classroomId: string,
  groupName: string
): Promise<{ success: boolean; group?: ClassroomGroup; error?: string }> {
  const access = await getClassroom(actorUserId, classroomId);
  if (!access.success || !access.classroom) {
    return { success: false, error: access.error };
  }

  const canManage = await checkCanManageClassroom(actorUserId, access.classroom.teacherId);
  if (!canManage) {
    return { success: false, error: "Unauthorized. Teacher privileges required." };
  }

  const name = (groupName || "").trim();
  if (name.length < 1 || name.length > 80) {
    return { success: false, error: "Group name must be between 1 and 80 characters" };
  }

  const now = new Date().toISOString();

  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_groups")
        .insert({
          classroom_id: classroomId,
          name,
          created_at: now,
        })
        .select()
        .single();

      if (!error && data) {
        return {
          success: true,
          group: {
            id: data.id,
            classroomId: data.classroom_id,
            name: data.name,
            memberCount: 0,
            createdAt: data.created_at,
          },
        };
      }
    } catch {
      // Memory fallback below
    }
  }

  const groups = memoryGroups.get(classroomId) || [];
  const newGroup: ClassroomGroup = {
    id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    classroomId,
    name,
    memberCount: 0,
    createdAt: now,
  };
  groups.push(newGroup);
  memoryGroups.set(classroomId, groups);
  memoryGroupMembers.set(newGroup.id, new Set());

  return { success: true, group: newGroup };
}

export async function assignStudentToGroup(
  actorUserId: string,
  classroomId: string,
  groupId: string,
  studentUserId: string
): Promise<{ success: boolean; error?: string }> {
  const access = await getClassroom(actorUserId, classroomId);
  if (!access.success || !access.classroom) {
    return { success: false, error: access.error };
  }

  const canManage = await checkCanManageClassroom(actorUserId, access.classroom.teacherId);
  if (!canManage) {
    return { success: false, error: "Unauthorized. Teacher privileges required." };
  }

  // Ensure target student is enrolled in classroom
  const roster = await listClassroomRoster(actorUserId, classroomId);
  const isEnrolled = roster.members?.some((m) => m.userId === studentUserId);
  if (!isEnrolled) {
    return { success: false, error: "Student is not enrolled in this classroom" };
  }

  const admin = createAdminClient();
  if (admin) {
    try {
      await admin.from("classroom_group_members").upsert({
        group_id: groupId,
        user_id: studentUserId,
      });
      return { success: true };
    } catch {
      // Memory fallback below
    }
  }

  const groupSet = memoryGroupMembers.get(groupId);
  if (!groupSet) {
    return { success: false, error: "Group not found" };
  }
  groupSet.add(studentUserId);

  return { success: true };
}

export async function listClassroomGroups(
  userId: string,
  classroomId: string
): Promise<{ success: boolean; groups?: ClassroomGroup[]; error?: string }> {
  const access = await getClassroom(userId, classroomId);
  if (!access.success) {
    return { success: false, error: access.error };
  }

  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_groups")
        .select("id, classroom_id, name, created_at")
        .eq("classroom_id", classroomId)
        .order("created_at", { ascending: true });

      if (!error && data) {
        return {
          success: true,
          groups: data.map((g) => ({
            id: g.id,
            classroomId: g.classroom_id,
            name: g.name,
            createdAt: g.created_at,
          })),
        };
      }
    } catch {
      // Memory fallback below
    }
  }

  const groups = memoryGroups.get(classroomId) || [];
  return { success: true, groups };
}

/**
 * 8. Assignment Management (Create, List, Get)
 */
export async function createAssignment(
  actorUserId: string,
  classroomId: string,
  input: CreateAssignmentInput
): Promise<{ success: boolean; assignment?: ClassroomAssignment; error?: string }> {
  const access = await getClassroom(actorUserId, classroomId);
  if (!access.success || !access.classroom) {
    return { success: false, error: access.error };
  }

  const canManage = await checkCanManageClassroom(actorUserId, access.classroom.teacherId);
  if (!canManage) {
    return { success: false, error: "Unauthorized. Teacher privileges required." };
  }

  const title = (input.title || "").trim();
  if (title.length < 1 || title.length > 160) {
    return { success: false, error: "Assignment title must be between 1 and 160 characters" };
  }

  const maxPoints = typeof input.maxPoints === "number" && input.maxPoints >= 0 ? input.maxPoints : 100;
  const now = new Date().toISOString();

  const starterCode = input.starterCode || {
    "main.cpp": '#include <iostream>\n\nint main() {\n    std::cout << "Hello, Classroom!" << std::endl;\n    return 0;\n}\n',
  };

  const publicTestCases = input.publicTestCases || [];
  const hiddenTestCases = input.hiddenTestCases || [];

  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_assignments")
        .insert({
          classroom_id: classroomId,
          title,
          description: input.description || "",
          starter_code: starterCode,
          public_test_cases: publicTestCases,
          hidden_test_cases: hiddenTestCases,
          due_date: input.dueDate || null,
          allow_late: input.allowLate ?? true,
          max_points: maxPoints,
          group_mode: input.groupMode ?? false,
          is_published: input.isPublished ?? false,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (!error && data) {
        return {
          success: true,
          assignment: {
            id: data.id,
            classroomId: data.classroom_id,
            title: data.title,
            description: data.description,
            starterCode: data.starter_code,
            publicTestCases: data.public_test_cases,
            hiddenTestCases: data.hidden_test_cases,
            dueDate: data.due_date,
            allowLate: data.allow_late,
            maxPoints: data.max_points,
            groupMode: data.group_mode,
            isPublished: data.is_published,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          },
        };
      }
    } catch {
      // Memory fallback below
    }
  }

  const assignments = memoryAssignments.get(classroomId) || [];
  const newAssignment: ClassroomAssignment = {
    id: `asg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    classroomId,
    title,
    description: input.description || "",
    starterCode,
    publicTestCases,
    hiddenTestCases,
    dueDate: input.dueDate,
    allowLate: input.allowLate ?? true,
    maxPoints,
    groupMode: input.groupMode ?? false,
    isPublished: input.isPublished ?? false,
    createdAt: now,
    updatedAt: now,
  };

  assignments.push(newAssignment);
  memoryAssignments.set(classroomId, assignments);

  return { success: true, assignment: newAssignment };
}

/**
 * 9. List Assignments (Privacy-Preserving)
 */
export async function listAssignments(
  userId: string,
  classroomId: string
): Promise<{ success: boolean; assignments?: ClassroomAssignment[]; error?: string }> {
  const access = await getClassroom(userId, classroomId);
  if (!access.success) {
    return { success: false, error: access.error };
  }

  const isTeacher = access.isTeacher;

  const admin = createAdminClient();
  if (admin) {
    try {
      let query = admin
        .from("classroom_assignments")
        .select("*")
        .eq("classroom_id", classroomId)
        .order("created_at", { ascending: false });

      if (!isTeacher) {
        query = query.eq("is_published", true);
      }

      const { data, error } = await query;
      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list: ClassroomAssignment[] = (data as any[]).map((d) => ({
          id: d.id as string,
          classroomId: d.classroom_id as string,
          title: d.title as string,
          description: (d.description as string | null) ?? "",
          starterCode: (d.starter_code as Record<string, string> | null) ?? {},
          publicTestCases: (d.public_test_cases as AssignmentTestCase[] | null) ?? [],
          // Security: Strip hidden tests for students
          hiddenTestCases: isTeacher
            ? ((d.hidden_test_cases as AssignmentTestCase[] | null) ?? [])
            : undefined,
          dueDate: (d.due_date as string | null) ?? undefined,
          allowLate: d.allow_late as boolean,
          maxPoints: d.max_points as number,
          groupMode: d.group_mode as boolean,
          isPublished: d.is_published as boolean,
          createdAt: d.created_at as string,
          updatedAt: d.updated_at as string,
        }));
        return { success: true, assignments: list };
      }
    } catch {
      // Memory fallback below
    }
  }

  const all = memoryAssignments.get(classroomId) || [];
  const list = all
    .filter((a) => isTeacher || a.isPublished)
    .map((a) => ({
      ...a,
      hiddenTestCases: isTeacher ? a.hiddenTestCases : undefined,
    }));

  return { success: true, assignments: list };
}

/**
 * 10. Get Single Assignment (Privacy-Preserving)
 */
export async function getAssignment(
  userId: string,
  classroomId: string,
  assignmentId: string
): Promise<{ success: boolean; assignment?: ClassroomAssignment; isTeacher?: boolean; error?: string }> {
  const access = await getClassroom(userId, classroomId);
  if (!access.success) {
    return { success: false, error: access.error };
  }

  const isTeacher = access.isTeacher;

  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_assignments")
        .select("*")
        .eq("id", assignmentId)
        .eq("classroom_id", classroomId)
        .single();

      if (error || !data) {
        return { success: false, error: "Assignment not found" };
      }

      if (!isTeacher && !data.is_published) {
        return { success: false, error: "Assignment is not published yet" };
      }

      return {
        success: true,
        assignment: {
          id: data.id,
          classroomId: data.classroom_id,
          title: data.title,
          description: data.description,
          starterCode: data.starter_code,
          publicTestCases: data.public_test_cases || [],
          hiddenTestCases: isTeacher ? (data.hidden_test_cases || []) : undefined,
          dueDate: data.due_date,
          allowLate: data.allow_late,
          maxPoints: data.max_points,
          groupMode: data.group_mode,
          isPublished: data.is_published,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
        isTeacher,
      };
    } catch {
      // Memory fallback below
    }
  }

  const all = memoryAssignments.get(classroomId) || [];
  const item = all.find((a) => a.id === assignmentId);

  if (!item) {
    return { success: false, error: "Assignment not found" };
  }

  if (!isTeacher && !item.isPublished) {
    return { success: false, error: "Assignment is not published yet" };
  }

  return {
    success: true,
    assignment: {
      ...item,
      hiddenTestCases: isTeacher ? item.hiddenTestCases : undefined,
    },
    isTeacher,
  };
}
