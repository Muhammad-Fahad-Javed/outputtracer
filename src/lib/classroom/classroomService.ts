import { randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthConfigured } from "@/lib/supabase/env";
import { inspectSourceFiles } from "@/lib/sourceFiles";
import { checkIsAdmin } from "@/lib/learn/db";
import {
  checkIsVerifiedTeacher,
  checkCanManageClassroom,
} from "./roles";
import {
  CLASSROOM_TIME_LIMIT_DEFAULT_MS,
  clampTimeLimitMs,
  policyFromRow,
} from "./assignmentPolicy";
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

export function _setMemoryMemberLabel(
  classroomId: string,
  userId: string,
  displayName: string,
  email?: string
): void {
  const members = memoryMembers.get(classroomId);
  const member = members?.find((item) => item.userId === userId);
  if (!member) return;
  member.displayName = displayName;
  if (email) member.email = email;
}

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
    code += chars.charAt(randomInt(chars.length));
  }
  return `OT-${code}`;
}

function toAssignment(data: object, isTeacher: boolean): ClassroomAssignment {
  const row = data as Record<string, unknown>;
  const policy = policyFromRow(row);
  const hidden = (row.hidden_test_cases ?? row.hiddenTestCases ?? []) as AssignmentTestCase[];
  const submissionCount = row.submission_count ?? row.submissionCount;
  return {
    id: String(row.id),
    classroomId: String(row.classroom_id ?? row.classroomId),
    title: String(row.title),
    description: String(row.description ?? ""),
    starterCode: (row.starter_code ?? row.starterCode ?? {}) as Record<string, string>,
    publicTestCases: (row.public_test_cases ?? row.publicTestCases ?? []) as AssignmentTestCase[],
    hiddenTestCases: isTeacher ? hidden : undefined,
    dueDate: policy.dueDate,
    allowLate: policy.allowLate,
    locked: policy.locked,
    allowRun: policy.allowRun,
    allowTrace: policy.allowTrace,
    timeLimitMs: policy.timeLimitMs,
    maxPoints: Number(row.max_points ?? row.maxPoints ?? 100),
    groupMode: Boolean(row.group_mode ?? row.groupMode),
    isPublished: Boolean(row.is_published ?? row.isPublished),
    submissionCount: typeof submissionCount === "number" ? submissionCount : undefined,
    createdAt: String(row.created_at ?? row.createdAt),
    updatedAt: String(row.updated_at ?? row.updatedAt),
  };
}

function memoryGroupViews(classroomId: string, includeEmail: boolean): ClassroomGroup[] {
  const roster = memoryMembers.get(classroomId) || [];
  return (memoryGroups.get(classroomId) || []).map((group) => {
    const ids = memoryGroupMembers.get(group.id) || new Set<string>();
    const members: ClassroomMember[] = roster
      .filter((member) => ids.has(member.userId))
      .map((member) => ({
        ...member,
        email: includeEmail ? member.email : undefined,
      }));
    for (const userId of ids) {
      if (!members.some((member) => member.userId === userId)) {
        members.push({
          classroomId,
          userId,
          role: "student",
          joinedAt: group.createdAt,
        });
      }
    }
    return { ...group, memberCount: members.length, members };
  });
}

function forgetGroupMemberships(classroomId: string, userId: string): void {
  for (const group of memoryGroups.get(classroomId) || []) {
    memoryGroupMembers.get(group.id)?.delete(userId);
  }
}

async function mutateGroupMemberAdmin(
  // Supabase query builders are thenable and generic; the calls below are the contract.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  mode: "assign" | "remove",
  classroomId: string,
  groupId: string,
  studentUserId: string
): Promise<{ handled: boolean; success: boolean; error?: string }> {
  const { data: group, error: groupError } = await admin
    .from("classroom_groups")
    .select("id, classroom_id")
    .eq("id", groupId)
    .maybeSingle();
  if (groupError) return { handled: false, success: false, error: groupError.message };
  if (!group || String(group.classroom_id) !== classroomId) {
    return { handled: true, success: false, error: "Group not found" };
  }

  if (mode === "remove") {
    const { error } = (await admin
      .from("classroom_group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", studentUserId)) as { error: { message: string } | null };
    if (error) return { handled: false, success: false, error: error.message };
    return { handled: true, success: true };
  }

  const listed = (await admin
    .from("classroom_groups")
    .select("id")
    .eq("classroom_id", classroomId)) as {
    data: { id: string }[] | null;
    error: { message: string } | null;
  };
  if (listed.error || !listed.data) {
    return { handled: false, success: false, error: listed.error?.message || "Could not list groups" };
  }
  const otherIds = listed.data.map((row) => String(row.id)).filter((id) => id !== groupId);
  if (otherIds.length > 0) {
    const removed = (await admin
      .from("classroom_group_members")
      .delete()
      .eq("user_id", studentUserId)
      .in("group_id", otherIds)) as { error: { message: string } | null };
    if (removed.error) return { handled: false, success: false, error: removed.error.message };
  }
  const saved = (await admin
    .from("classroom_group_members")
    .upsert(
      { group_id: groupId, user_id: studentUserId },
      { onConflict: "group_id,user_id" }
    )) as { error: { message: string } | null };
  if (saved.error) return { handled: false, success: false, error: saved.error.message };
  return { handled: true, success: true };
}

async function deleteClassGroupMembershipsAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  classroomId: string,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  const listed = (await admin
    .from("classroom_groups")
    .select("id")
    .eq("classroom_id", classroomId)) as {
    data: { id: string }[] | null;
    error: { message: string } | null;
  };
  if (listed.error) return { ok: false, error: listed.error.message };
  const ids = (listed.data || []).map((row) => String(row.id));
  if (ids.length === 0) return { ok: true };
  const removed = (await admin
    .from("classroom_group_members")
    .delete()
    .eq("user_id", userId)
    .in("group_id", ids)) as { error: { message: string } | null };
  if (removed.error) return { ok: false, error: removed.error.message };
  return { ok: true };
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
      teaching.push({
        ...c,
        memberCount: (memoryMembers.get(c.id) || []).length,
        assignmentCount: (memoryAssignments.get(c.id) || []).length,
      });
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
      const cleared = await deleteClassGroupMembershipsAdmin(admin, classroomId, targetUserId);
      if (!cleared.ok) {
        if (isAuthConfigured()) {
          return { success: false, error: cleared.error || "Could not remove group memberships" };
        }
      } else {
        const { error } = await admin
          .from("classroom_members")
          .delete()
          .eq("classroom_id", classroomId)
          .eq("user_id", targetUserId);
        if (!error) return { success: true };
        if (isAuthConfigured()) {
          return { success: false, error: error.message };
        }
      }
    } catch {
      if (isAuthConfigured()) {
        return { success: false, error: "Could not remove the class member" };
      }
    }
  }

  const members = memoryMembers.get(classroomId) || [];
  forgetGroupMemberships(classroomId, targetUserId);
  memoryMembers.set(
    classroomId,
    members.filter((m) => m.userId !== targetUserId)
  );
  return { success: true };
}

/**
 * 6b. Add Member to Classroom (Invitation acceptance or admin)
 */
export async function addClassroomMember(
  classroomId: string,
  userId: string,
  role: ClassroomRole = "student"
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data: existing } = await admin
        .from("classroom_members")
        .select("role")
        .eq("classroom_id", classroomId)
        .eq("user_id", userId)
        .maybeSingle();

      if (existing) {
        return { success: false, error: "User is already enrolled in this classroom." };
      }

      const { error: insErr } = await admin.from("classroom_members").insert({
        classroom_id: classroomId,
        user_id: userId,
        role,
        joined_at: new Date().toISOString(),
      });

      if (insErr) {
        return { success: false, error: insErr.message };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to enroll member";
      return { success: false, error: msg };
    }
  }

  const members = memoryMembers.get(classroomId) || [];
  if (members.some((m) => m.userId === userId)) {
    return { success: false, error: "User is already enrolled in this classroom." };
  }

  members.push({
    classroomId,
    userId,
    role,
    joinedAt: new Date().toISOString(),
  });
  memoryMembers.set(classroomId, members);
  const classroom = memoryClassrooms.get(classroomId);
  if (classroom) classroom.memberCount = members.length;
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
            members: [],
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
    members: [],
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
      const result = await mutateGroupMemberAdmin(admin, "assign", classroomId, groupId, studentUserId);
      if (result.handled) return { success: result.success, error: result.error };
    } catch {
      if (isAuthConfigured()) {
        return { success: false, error: "Could not assign the student to that group" };
      }
    }
  }

  const groups = memoryGroups.get(classroomId) || [];
  if (!groups.some((group) => group.id === groupId)) {
    return { success: false, error: "Group not found" };
  }
  for (const group of groups) {
    if (group.id !== groupId) memoryGroupMembers.get(group.id)?.delete(studentUserId);
  }
  const groupSet = memoryGroupMembers.get(groupId) ?? new Set<string>();
  groupSet.add(studentUserId);
  memoryGroupMembers.set(groupId, groupSet);

  return { success: true };
}

export async function removeStudentFromGroup(
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

  const admin = createAdminClient();
  if (admin) {
    try {
      const result = await mutateGroupMemberAdmin(admin, "remove", classroomId, groupId, studentUserId);
      if (result.handled) return { success: result.success, error: result.error };
    } catch {
      if (isAuthConfigured()) {
        return { success: false, error: "Could not remove the student from that group" };
      }
    }
  }

  const groups = memoryGroups.get(classroomId) || [];
  if (!groups.some((group) => group.id === groupId)) {
    return { success: false, error: "Group not found" };
  }
  memoryGroupMembers.get(groupId)?.delete(studentUserId);
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

  const includeEmail = Boolean(access.isTeacher);
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_groups")
        .select("id, classroom_id, name, created_at")
        .eq("classroom_id", classroomId)
        .order("created_at", { ascending: true });

      if (!error && data) {
        const ids = data.map((group) => String(group.id));
        const memberships = new Map<string, string[]>();
        if (ids.length > 0) {
          const { data: memberRows, error: memberError } = await admin
            .from("classroom_group_members")
            .select("group_id, user_id")
            .in("group_id", ids);
          if (memberError) {
            if (isAuthConfigured()) {
              return { success: false, error: memberError.message };
            }
            throw new Error(memberError.message);
          } else {
            for (const row of memberRows || []) {
              const groupId = String(row.group_id);
              const list = memberships.get(groupId) || [];
              list.push(String(row.user_id));
              memberships.set(groupId, list);
            }
          }
        }
        const roster = await listClassroomRoster(userId, classroomId);
        const byUser = new Map((roster.members || []).map((member) => [member.userId, member]));
        return {
          success: true,
          groups: data.map((group) => {
            const userIds = memberships.get(String(group.id)) || [];
            const members: ClassroomMember[] = userIds.map((memberId) => {
              const known = byUser.get(memberId);
              if (known) return { ...known, email: includeEmail ? known.email : undefined };
              return {
                classroomId,
                userId: memberId,
                role: "student" as const,
                joinedAt: String(group.created_at),
              };
            });
            return {
              id: String(group.id),
              classroomId: String(group.classroom_id),
              name: String(group.name),
              memberCount: members.length,
              members,
              createdAt: String(group.created_at),
            };
          }),
        };
      }
    } catch {
      if (isAuthConfigured()) {
        return { success: false, error: "Could not load groups" };
      }
    }
  }

  return { success: true, groups: memoryGroupViews(classroomId, includeEmail) };
}

function normalizeAssignmentTests(
  raw: AssignmentTestCase[] | undefined,
  hidden: boolean
): { ok: true; tests: AssignmentTestCase[] } | { ok: false; error: string } {
  if (!raw) return { ok: true, tests: [] };
  if (!Array.isArray(raw) || raw.length > 50) {
    return { ok: false, error: "An assignment can include at most 50 test cases." };
  }
  const tests: AssignmentTestCase[] = [];
  for (const tc of raw) {
    const name = typeof tc?.name === "string" ? tc.name.trim() : "";
    if (!name || name.length > 80) {
      return { ok: false, error: "Each test case needs a name of 1–80 characters." };
    }
    const stdin = typeof tc.stdin === "string" ? tc.stdin : "";
    const expectedOutput = typeof tc.expectedOutput === "string" ? tc.expectedOutput : "";
    if (Buffer.byteLength(stdin, "utf8") > 8192 || Buffer.byteLength(expectedOutput, "utf8") > 8192) {
      return { ok: false, error: "A test case input or expected output is too large." };
    }
    const points = typeof tc.points === "number" && tc.points >= 0 && tc.points <= 10000 ? tc.points : 0;
    const id = typeof tc.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(tc.id) ? tc.id : `tc-${tests.length + 1}`;
    tests.push({ id, name, stdin, expectedOutput, points, isHidden: hidden || Boolean(tc.isHidden) });
  }
  return { ok: true, tests };
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

  const maxPoints = typeof input.maxPoints === "number" && input.maxPoints >= 0 && input.maxPoints <= 10000
    ? input.maxPoints
    : 100;
  const now = new Date().toISOString();

  const starterCode =
    input.starterCode && Object.keys(input.starterCode).length > 0
      ? input.starterCode
      : {
          "main.cpp":
            "#include <iostream>\n\nint main() {\n    // Write your solution here.\n    return 0;\n}\n",
        };

  const inspected = inspectSourceFiles(starterCode, { maxFiles: 16, maxSourceBytes: 200 * 1024 });
  if (!inspected.ok) {
    return { success: false, error: inspected.message };
  }

  const publicTests = normalizeAssignmentTests(input.publicTestCases, false);
  if (!publicTests.ok) return { success: false, error: publicTests.error };
  const hiddenTests = normalizeAssignmentTests(input.hiddenTestCases, true);
  if (!hiddenTests.ok) return { success: false, error: hiddenTests.error };
  const publicTestCases = publicTests.tests;
  const hiddenTestCases = hiddenTests.tests;

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
          locked: input.locked ?? false,
          allow_run: input.allowRun !== false,
          allow_trace: input.allowTrace === true,
          time_limit_ms: clampTimeLimitMs(input.timeLimitMs ?? CLASSROOM_TIME_LIMIT_DEFAULT_MS),
          max_points: maxPoints,
          group_mode: input.groupMode ?? false,
          is_published: input.isPublished ?? false,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (!error && data) {
        return { success: true, assignment: toAssignment(data, true) };
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
    locked: input.locked ?? false,
    allowRun: input.allowRun !== false,
    allowTrace: input.allowTrace === true,
    timeLimitMs: clampTimeLimitMs(input.timeLimitMs ?? CLASSROOM_TIME_LIMIT_DEFAULT_MS),
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
        return {
          success: true,
          // Hidden tests are omitted for students inside toAssignment.
          assignments: (data as object[]).map((row) => toAssignment(row, Boolean(isTeacher))),
        };
      }
    } catch {
      // Memory fallback below
    }
  }

  const all = memoryAssignments.get(classroomId) || [];
  const list = all
    .filter((a) => isTeacher || a.isPublished)
    .map((a) => toAssignment(a, Boolean(isTeacher)));

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
        assignment: toAssignment(data, Boolean(isTeacher)),
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
    assignment: toAssignment(item, Boolean(isTeacher)),
    isTeacher,
  };
}

export async function readAssignmentPolicy(classroomId: string, assignmentId: string) {
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_assignments")
        .select("due_date, allow_late, locked, allow_run, allow_trace, time_limit_ms")
        .eq("id", assignmentId)
        .eq("classroom_id", classroomId)
        .maybeSingle();
      if (!error && data) return policyFromRow(data);
      if (!error && !data) return null;
    } catch {
      // Memory fallback below.
    }
  }
  const item = (memoryAssignments.get(classroomId) || []).find((assignment) => assignment.id === assignmentId);
  return item ? policyFromRow(item) : null;
}

export async function updateAssignmentPolicy(
  actorUserId: string,
  classroomId: string,
  assignmentId: string,
  patch: {
    locked?: boolean;
    allowLate?: boolean;
    allowRun?: boolean;
    allowTrace?: boolean;
    timeLimitMs?: number;
  }
): Promise<{ success: boolean; assignment?: ClassroomAssignment; error?: string }> {
  const access = await getClassroom(actorUserId, classroomId);
  if (!access.success || !access.classroom) {
    return { success: false, error: access.error || "Classroom not found" };
  }
  const canManage = await checkCanManageClassroom(actorUserId, access.classroom.teacherId);
  if (!canManage) {
    return { success: false, error: "Unauthorized. Teacher privileges required." };
  }

  const current = await getAssignment(actorUserId, classroomId, assignmentId);
  if (!current.success || !current.assignment) {
    return { success: false, error: current.error || "Assignment not found" };
  }

  if (patch.locked !== undefined && typeof patch.locked !== "boolean") {
    return { success: false, error: "locked must be true or false." };
  }
  if (patch.allowLate !== undefined && typeof patch.allowLate !== "boolean") {
    return { success: false, error: "allowLate must be true or false." };
  }
  if (patch.allowRun !== undefined && typeof patch.allowRun !== "boolean") {
    return { success: false, error: "allowRun must be true or false." };
  }
  if (patch.allowTrace !== undefined && typeof patch.allowTrace !== "boolean") {
    return { success: false, error: "allowTrace must be true or false." };
  }
  if (
    patch.timeLimitMs !== undefined &&
    (typeof patch.timeLimitMs !== "number" || !Number.isFinite(patch.timeLimitMs))
  ) {
    return { success: false, error: "timeLimitMs must be a number of milliseconds." };
  }

  const next = {
    locked: patch.locked ?? current.assignment.locked,
    allowLate: patch.allowLate ?? current.assignment.allowLate,
    allowRun: patch.allowRun ?? current.assignment.allowRun,
    allowTrace: patch.allowTrace ?? current.assignment.allowTrace,
    timeLimitMs:
      patch.timeLimitMs === undefined
        ? current.assignment.timeLimitMs
        : clampTimeLimitMs(patch.timeLimitMs),
  };
  const updatedAt = new Date().toISOString();

  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_assignments")
        .update({
          locked: next.locked,
          allow_late: next.allowLate,
          allow_run: next.allowRun,
          allow_trace: next.allowTrace,
          time_limit_ms: next.timeLimitMs,
          updated_at: updatedAt,
        })
        .eq("id", assignmentId)
        .eq("classroom_id", classroomId)
        .select("*")
        .single();
      if (!error && data) return { success: true, assignment: toAssignment(data, true) };
      if (error && isAuthConfigured()) return { success: false, error: error.message };
    } catch {
      if (isAuthConfigured()) return { success: false, error: "Could not update assignment policy." };
    }
  }

  const stored = (memoryAssignments.get(classroomId) || []).find((assignment) => assignment.id === assignmentId);
  if (!stored) return { success: false, error: "Assignment not found" };
  stored.locked = next.locked;
  stored.allowLate = next.allowLate;
  stored.allowRun = next.allowRun;
  stored.allowTrace = next.allowTrace;
  stored.timeLimitMs = next.timeLimitMs;
  stored.updatedAt = updatedAt;
  return { success: true, assignment: toAssignment(stored, true) };
}

/**
 * True when this user is a member of a group that belongs to the classroom.
 * Fail closed when the group cannot be found.
 */
export async function callerCanUseGroup(
  userId: string,
  classroomId: string,
  groupId: string
): Promise<boolean> {
  const admin = createAdminClient();
  if (admin) {
    const { data: group } = await admin
      .from("classroom_groups")
      .select("classroom_id")
      .eq("id", groupId)
      .maybeSingle();
    if (!group || group.classroom_id !== classroomId) return false;
    const { data: member } = await admin
      .from("classroom_group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();
    return Boolean(member);
  }

  const groups = memoryGroups.get(classroomId) || [];
  if (!groups.some((group) => group.id === groupId)) return false;
  return memoryGroupMembers.get(groupId)?.has(userId) ?? false;
}

/** Group ids in this classroom that include the caller. Empty when none match. */
export async function listCallerGroupIds(
  userId: string,
  classroomId: string
): Promise<string[]> {
  if (!userId || !classroomId) return [];

  const admin = createAdminClient();
  if (admin) {
    const { data: groups, error } = await admin
      .from("classroom_groups")
      .select("id")
      .eq("classroom_id", classroomId);
    if (error || !groups?.length) return [];
    const ids = groups.map((group) => String(group.id));
    const { data: members, error: memberError } = await admin
      .from("classroom_group_members")
      .select("group_id")
      .eq("user_id", userId)
      .in("group_id", ids);
    if (memberError || !members) return [];
    return members.map((member) => String(member.group_id));
  }

  const groups = memoryGroups.get(classroomId) || [];
  return groups
    .filter((group) => memoryGroupMembers.get(group.id)?.has(userId))
    .map((group) => group.id);
}

/**
 * True when the assignment belongs to this classroom.
 *
 * With a database, a missing row is a denial. Without one, the in-memory
 * catalog is checked when it contains anything; an empty catalog (unit tests
 * and the offline fallback) does not invent a denial.
 */
export async function assignmentBelongsToClassroom(
  classroomId: string,
  assignmentId: string
): Promise<boolean> {
  const admin = createAdminClient();
  if (admin) {
    const { data, error } = await admin
      .from("classroom_assignments")
      .select("classroom_id")
      .eq("id", assignmentId)
      .maybeSingle();
    if (error || !data) return false;
    return data.classroom_id === classroomId;
  }

  let catalog = false;
  for (const [id, list] of memoryAssignments) {
    if (list.length > 0) catalog = true;
    if (list.some((assignment) => assignment.id === assignmentId)) {
      return id === classroomId;
    }
  }
  return !catalog;
}
