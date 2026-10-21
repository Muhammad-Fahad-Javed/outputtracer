import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/learn/db";
import {
  TeacherApplicationStatus,
  TeacherProfile,
  UserCapabilities,
} from "./types";

// In-memory fallback stores for test and local unmigrated development
const memoryTeacherProfiles = new Map<string, TeacherProfile>();
const memoryTeacherAppStatus = new Map<string, TeacherApplicationStatus>();

export function _resetMemoryStores(): void {
  memoryTeacherProfiles.clear();
  memoryTeacherAppStatus.clear();
}

export function _setMemoryTeacherProfile(userId: string, profile: TeacherProfile): void {
  memoryTeacherProfiles.set(userId, profile);
}

export function _setMemoryTeacherAppStatus(userId: string, status: TeacherApplicationStatus): void {
  memoryTeacherAppStatus.set(userId, status);
}

/**
 * Checks whether the given user has verified teacher status.
 *
 * Rules:
 * 1. An ordinary student or unverified applicant is NEVER considered a teacher.
 * 2. Checks Supabase `teacher_profiles` via privileged service client.
 * 3. Status must be explicitly 'approved' (suspended or revoked returns false).
 * 4. Fallback in-memory store used in test environments when Supabase is unconfigured or mocked.
 */
export async function checkIsVerifiedTeacher(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;

  // 1. Check database via admin client
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("teacher_profiles")
        .select("status")
        .eq("user_id", userId)
        .eq("status", "approved")
        .maybeSingle();

      if (!error && data?.status === "approved") {
        return true;
      }
    } catch {
      // Handled by memory fallback below
    }
  }

  // 2. In-memory check for tests / offline
  const memory = memoryTeacherProfiles.get(userId);
  return memory?.status === "approved";
}

/**
 * Gets detailed teacher verification and application state for a user.
 */
export async function getTeacherVerificationDetails(
  userId: string | undefined
): Promise<{
  isVerified: boolean;
  status: TeacherApplicationStatus | "none";
  profile?: TeacherProfile;
}> {
  if (!userId) {
    return { isVerified: false, status: "none" };
  }

  const isVerified = await checkIsVerifiedTeacher(userId);
  let status: TeacherApplicationStatus | "none" = "none";
  let profile: TeacherProfile | undefined;

  const admin = createAdminClient();
  if (admin) {
    try {
      const [profRes, appRes] = await Promise.all([
        admin.from("teacher_profiles").select("*").eq("user_id", userId).maybeSingle(),
        admin
          .from("teacher_applications")
          .select("status")
          .eq("user_id", userId)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (profRes.data) {
        profile = {
          userId: profRes.data.user_id,
          status: profRes.data.status,
          applicationId: profRes.data.application_id,
          approvedBy: profRes.data.approved_by,
          verifiedAt: profRes.data.verified_at,
          suspendedAt: profRes.data.suspended_at,
          suspensionReason: profRes.data.suspension_reason,
          createdAt: profRes.data.created_at,
          updatedAt: profRes.data.updated_at,
        };
      }

      if (appRes.data?.status) {
        status = appRes.data.status as TeacherApplicationStatus;
      }
    } catch {
      // Handled by memory fallback below
    }
  }

  if (!profile && memoryTeacherProfiles.has(userId)) {
    profile = memoryTeacherProfiles.get(userId);
  }
  if (status === "none" && memoryTeacherAppStatus.has(userId)) {
    status = memoryTeacherAppStatus.get(userId)!;
  }

  return { isVerified, status, profile };
}

/**
 * Verifies whether a user can manage a specific classroom.
 *
 * Rules:
 * - Classroom owner (teacher) can manage.
 * - Platform admin can manage.
 * - Unrelated teachers or students CANNOT manage.
 */
export async function checkCanManageClassroom(
  userId: string | undefined,
  classroomOwnerId: string
): Promise<boolean> {
  if (!userId) return false;

  // Platform admin has management access
  const isAdmin = await checkIsAdmin(userId);
  if (isAdmin) return true;

  // Must be verified teacher AND the classroom owner
  if (userId === classroomOwnerId) {
    return checkIsVerifiedTeacher(userId);
  }

  return false;
}

/**
 * Returns complete scoped user capabilities.
 */
export async function getUserCapabilities(userId: string | undefined): Promise<UserCapabilities> {
  if (!userId) {
    return {
      isAuthenticated: false,
      isAdmin: false,
      isVerifiedTeacher: false,
      teacherApplicationStatus: "none",
      canCreateClassroom: false,
    };
  }

  const [isAdmin, isTeacher, details] = await Promise.all([
    checkIsAdmin(userId),
    checkIsVerifiedTeacher(userId),
    getTeacherVerificationDetails(userId),
  ]);

  return {
    isAuthenticated: true,
    isAdmin,
    isVerifiedTeacher: isTeacher,
    teacherApplicationStatus: details.status,
    canCreateClassroom: isAdmin || isTeacher,
  };
}
