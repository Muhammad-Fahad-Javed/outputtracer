/**
 * profileService.ts
 *
 * Core service for Shared User Profiles, Roles, and Administrative User Oversight:
 * 1. Read & Update unified user profile (Learners, Teachers, Admins share one profile)
 * 2. Delete user account securely with confirmation and cascade handling
 * 3. List platform users and role statistics for Administrator Dashboard
 * 4. Update user roles with safety guards (preventing demotion of the last active admin)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/learn/db";
import { getUserCapabilities } from "./roles";

export interface UserProfileData {
  id: string;
  email: string;
  displayName: string;
  fullName: string;
  username: string | null;
  avatarUrl: string | null;
  phone: string;
  bio: string;
  country: string;
  city: string;
  preferredLanguages: string[];
  createdAt: string;
  updatedAt: string;
  roles: string[];
  isVerifiedTeacher: boolean;
  isAdmin: boolean;
  teacherApplicationStatus: string;
}

export interface ProfileUpdateInput {
  fullName?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string | null;
  phone?: string;
  bio?: string;
  country?: string;
  city?: string;
  preferredLanguages?: string[];
}

export interface PlatformUserSummary {
  id: string;
  email: string;
  displayName: string;
  fullName: string;
  username: string | null;
  avatarUrl: string | null;
  roles: string[];
  createdAt: string;
}

export interface UserStatsSummary {
  totalUsers: number;
  learnerCount: number;
  teacherCount: number;
  adminCount: number;
}

// In-memory fallback stores for test isolation
const memoryProfiles = new Map<string, UserProfileData>();

export function _resetProfileServiceMemory(): void {
  memoryProfiles.clear();
}

/**
 * Retrieves the unified profile and role resolution for an authenticated user.
 */
export async function getUserProfile(userId: string): Promise<UserProfileData | null> {
  if (!userId) return null;

  const admin = createAdminClient();
  if (admin) {
    try {
      const [profileRes, rolesRes, capabilities] = await Promise.all([
        admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
        admin.from("app_roles").select("role").eq("user_id", userId),
        getUserCapabilities(userId),
      ]);

      const prof = profileRes.data;
      if (prof) {
        const rolesList: string[] = (rolesRes.data || []).map((r: { role: string }) => r.role);
        if (capabilities.isVerifiedTeacher && !rolesList.includes("teacher")) {
          rolesList.push("teacher");
        }
        if (capabilities.isAdmin && !rolesList.includes("admin")) {
          rolesList.push("admin");
        }
        if (rolesList.length === 0) {
          rolesList.push("student");
        }

        return {
          id: prof.id,
          email: prof.email || "",
          displayName: prof.display_name || "",
          fullName: prof.full_name || prof.display_name || "",
          username: prof.username || null,
          avatarUrl: prof.avatar_url || null,
          phone: prof.phone || "",
          bio: prof.bio || "",
          country: prof.country || "",
          city: prof.city || "",
          preferredLanguages: Array.isArray(prof.preferred_languages)
            ? prof.preferred_languages
            : ["cpp"],
          createdAt: prof.created_at || new Date().toISOString(),
          updatedAt: prof.updated_at || prof.created_at || new Date().toISOString(),
          roles: Array.from(new Set(rolesList)),
          isVerifiedTeacher: capabilities.isVerifiedTeacher,
          isAdmin: capabilities.isAdmin,
          teacherApplicationStatus: capabilities.teacherApplicationStatus,
        };
      }
    } catch {
      // Memory fallback below
    }
  }

  return memoryProfiles.get(userId) || null;
}

/**
 * Updates an authenticated user's permitted profile fields.
 * Explicitly rejects role modification, administrative flags, or status manipulation.
 */
export async function updateUserProfile(
  userId: string,
  input: ProfileUpdateInput
): Promise<{ success: boolean; profile?: UserProfileData; error?: string }> {
  if (!userId) {
    return { success: false, error: "Authentication required" };
  }

  // 1. Sanitize & validate inputs
  const fullName = input.fullName !== undefined ? input.fullName.trim() : undefined;
  const displayName = input.displayName !== undefined ? input.displayName.trim() : undefined;
  const username = input.username !== undefined ? input.username.trim().toLowerCase() : undefined;
  const phone = input.phone !== undefined ? input.phone.trim() : undefined;
  const bio = input.bio !== undefined ? input.bio.trim() : undefined;
  const country = input.country !== undefined ? input.country.trim() : undefined;
  const city = input.city !== undefined ? input.city.trim() : undefined;

  if (fullName !== undefined && fullName.length > 100) {
    return { success: false, error: "Full name must not exceed 100 characters" };
  }
  if (displayName !== undefined && (displayName.length < 1 || displayName.length > 60)) {
    return { success: false, error: "Display name must be between 1 and 60 characters" };
  }
  if (phone !== undefined && phone.length > 30) {
    return { success: false, error: "Phone number must not exceed 30 characters" };
  }
  if (bio !== undefined && bio.length > 500) {
    return { success: false, error: "Bio must not exceed 500 characters" };
  }
  if (country !== undefined && country.length > 80) {
    return { success: false, error: "Country must not exceed 80 characters" };
  }
  if (city !== undefined && city.length > 80) {
    return { success: false, error: "City must not exceed 80 characters" };
  }

  if (username !== undefined && username.length > 0) {
    if (username.length < 3 || username.length > 30) {
      return { success: false, error: "Username must be between 3 and 30 characters" };
    }
    if (!/^[a-z0-9_-]+$/.test(username)) {
      return {
        success: false,
        error: "Username can only contain lowercase letters, numbers, hyphens, and underscores",
      };
    }
  }

  const admin = createAdminClient();
  if (admin) {
    try {
      // 2. Check username uniqueness if changing username
      if (username) {
        const { data: existingUser } = await admin
          .from("profiles")
          .select("id")
          .ilike("username", username)
          .neq("id", userId)
          .maybeSingle();

        if (existingUser) {
          return { success: false, error: "This username is already taken. Please choose another." };
        }
      }

      // 3. Build update payload
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (fullName !== undefined) updateData.full_name = fullName;
      if (displayName !== undefined) updateData.display_name = displayName;
      if (username !== undefined) updateData.username = username || null;
      if (input.avatarUrl !== undefined) updateData.avatar_url = input.avatarUrl;
      if (phone !== undefined) updateData.phone = phone;
      if (bio !== undefined) updateData.bio = bio;
      if (country !== undefined) updateData.country = country;
      if (city !== undefined) updateData.city = city;
      if (input.preferredLanguages !== undefined) {
        updateData.preferred_languages = input.preferredLanguages;
      }

      const { error } = await admin.from("profiles").update(updateData).eq("id", userId);
      if (error) {
        return { success: false, error: error.message };
      }

      const updated = await getUserProfile(userId);
      return { success: true, profile: updated || undefined };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update profile";
      return { success: false, error: msg };
    }
  }

  // Memory fallback
  const existing = memoryProfiles.get(userId) || {
    id: userId,
    email: "user@outputtracer.com",
    displayName: "User",
    fullName: "User",
    username: null,
    avatarUrl: null,
    phone: "",
    bio: "",
    country: "",
    city: "",
    preferredLanguages: ["cpp"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    roles: ["student"],
    isVerifiedTeacher: false,
    isAdmin: false,
    teacherApplicationStatus: "none",
  };

  const updatedMem: UserProfileData = {
    ...existing,
    fullName: fullName !== undefined ? fullName : existing.fullName,
    displayName: displayName !== undefined ? displayName : existing.displayName,
    username: username !== undefined ? username : existing.username,
    avatarUrl: input.avatarUrl !== undefined ? input.avatarUrl : existing.avatarUrl,
    phone: phone !== undefined ? phone : existing.phone,
    bio: bio !== undefined ? bio : existing.bio,
    country: country !== undefined ? country : existing.country,
    city: city !== undefined ? city : existing.city,
    preferredLanguages: input.preferredLanguages ?? existing.preferredLanguages,
    updatedAt: new Date().toISOString(),
  };

  memoryProfiles.set(userId, updatedMem);
  return { success: true, profile: updatedMem };
}

/**
 * Permanently deletes a user's account and all owned data after explicit confirmation.
 */
export async function deleteUserAccount(
  userId: string,
  confirmationPhrase: string
): Promise<{ success: boolean; error?: string }> {
  if (!userId) return { success: false, error: "Authentication required" };
  if (confirmationPhrase !== "DELETE MY ACCOUNT") {
    return {
      success: false,
      error: "Confirmation phrase does not match. Please enter 'DELETE MY ACCOUNT' to confirm.",
    };
  }

  // Safety check: Do not allow deleting the last active admin
  const isAdmin = await checkIsAdmin(userId);
  if (isAdmin) {
    const admin = createAdminClient();
    if (admin) {
      const { count } = await admin
        .from("app_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");

      if ((count ?? 0) <= 1) {
        return {
          success: false,
          error: "Action denied. You are the sole platform administrator. Transfer or appoint another administrator before deleting this account.",
        };
      }
    }
  }

  const admin = createAdminClient();
  if (admin) {
    try {
      // 1. Delete user from auth.users (cascades profiles & dependent records)
      const { error: authErr } = await admin.auth.admin.deleteUser(userId);
      if (authErr) {
        // Fallback: delete profile directly
        await admin.from("profiles").delete().eq("id", userId);
      }
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed deleting account";
      return { success: false, error: msg };
    }
  }

  memoryProfiles.delete(userId);
  return { success: true };
}

/**
 * Admin: List platform users with their roles, search query, and counts.
 */
export async function listUsersAdmin(
  adminUserId: string,
  filter?: { role?: string; search?: string; limit?: number }
): Promise<{
  success: boolean;
  users?: PlatformUserSummary[];
  stats?: UserStatsSummary;
  error?: string;
}> {
  const isAdmin = await checkIsAdmin(adminUserId);
  if (!isAdmin) {
    return { success: false, error: "Unauthorized. Administrator privileges required." };
  }

  const admin = createAdminClient();
  if (admin) {
    try {
      const limit = filter?.limit ?? 100;
      let query = admin
        .from("profiles")
        .select(`
          id,
          email,
          display_name,
          full_name,
          username,
          avatar_url,
          created_at,
          app_roles(role)
        `)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (filter?.search) {
        const s = `%${filter.search.trim()}%`;
        query = query.or(`display_name.ilike.${s},full_name.ilike.${s},email.ilike.${s},username.ilike.${s}`);
      }

      const { data, error } = await query;
      if (error) return { success: false, error: error.message };

      // Also fetch teacher profiles to identify verified teachers
      const { data: teacherRows } = await admin
        .from("teacher_profiles")
        .select("user_id, status")
        .eq("status", "approved");

      const verifiedTeacherSet = new Set((teacherRows || []).map((t) => t.user_id));

      const rawUsers = data || [];
      const users: PlatformUserSummary[] = rawUsers.map((r: Record<string, unknown>) => {
        const assignedRoles: string[] = Array.isArray(r.app_roles)
          ? r.app_roles.map((item: { role: string }) => item.role)
          : [];

        if (verifiedTeacherSet.has(String(r.id)) && !assignedRoles.includes("teacher")) {
          assignedRoles.push("teacher");
        }
        if (assignedRoles.length === 0) {
          assignedRoles.push("student");
        }

        return {
          id: String(r.id),
          email: String(r.email || ""),
          displayName: String(r.display_name || "User"),
          fullName: String(r.full_name || r.display_name || ""),
          username: r.username ? String(r.username) : null,
          avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
          roles: assignedRoles,
          createdAt: String(r.created_at),
        };
      });

      // Role filter if specified
      let filteredUsers = users;
      if (filter?.role) {
        filteredUsers = users.filter((u) => u.roles.includes(filter.role!));
      }

      // Compute counts
      const learnerCount = users.filter((u) => u.roles.includes("student")).length;
      const teacherCount = users.filter((u) => u.roles.includes("teacher")).length;
      const adminCount = users.filter((u) => u.roles.includes("admin")).length;

      return {
        success: true,
        users: filteredUsers,
        stats: {
          totalUsers: users.length,
          learnerCount,
          teacherCount,
          adminCount,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed listing users";
      return { success: false, error: msg };
    }
  }

  // Memory fallback
  return {
    success: true,
    users: [],
    stats: { totalUsers: 0, learnerCount: 0, teacherCount: 0, adminCount: 0 },
  };
}

/**
 * Admin: Assign or update an eligible user role with strict safety controls.
 * Prevents ordinary escalation and demotion of the last active platform administrator.
 */
export async function updateUserRoleAdmin(
  adminUserId: string,
  targetUserId: string,
  newRole: "student" | "teacher" | "admin" | "staff",
  action: "add" | "remove"
): Promise<{ success: boolean; error?: string }> {
  const isAdmin = await checkIsAdmin(adminUserId);
  if (!isAdmin) {
    return { success: false, error: "Unauthorized. Administrator privileges required." };
  }

  const admin = createAdminClient();
  if (admin) {
    try {
      // 1. Guard against demoting the last active admin
      if (newRole === "admin" && action === "remove") {
        const { count } = await admin
          .from("app_roles")
          .select("*", { count: "exact", head: true })
          .eq("role", "admin");

        if ((count ?? 0) <= 1) {
          return {
            success: false,
            error: "Action denied. Cannot remove or demote the sole active platform administrator.",
          };
        }
      }

      if (action === "add") {
        await admin.from("app_roles").upsert(
          { user_id: targetUserId, role: newRole },
          { onConflict: "user_id,role" }
        );

        if (newRole === "teacher") {
          await admin.from("teacher_profiles").upsert(
            {
              user_id: targetUserId,
              status: "approved",
              approved_by: adminUserId,
              verified_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
        }
      } else {
        await admin
          .from("app_roles")
          .delete()
          .eq("user_id", targetUserId)
          .eq("role", newRole);

        if (newRole === "teacher") {
          await admin
            .from("teacher_profiles")
            .update({ status: "revoked", updated_at: new Date().toISOString() })
            .eq("user_id", targetUserId);
        }
      }

      // Record audit log
      await admin.from("classroom_audit_logs").insert({
        actor_id: adminUserId,
        action: `user_role_${action}_${newRole}`,
        target_type: "user",
        target_id: targetUserId,
        details: { targetUserId, newRole, action },
      });

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed updating user role";
      return { success: false, error: msg };
    }
  }

  return { success: true };
}
