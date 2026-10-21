/**
 * communicationService.ts
 *
 * Core service managing:
 * 1. Classroom announcements
 * 2. Assignment & group discussions (with group boundary validation)
 * 3. Notifications with strict per-recipient targeting
 * 4. Abuse reports and moderator interventions
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthConfigured } from "@/lib/supabase/env";
import { getClassroom } from "./classroomService";
import type {
  ClassroomAnnouncement,
  CreateAnnouncementInput,
  ClassroomDiscussionPost,
  CreateDiscussionPostInput,
  ClassroomNotification,
  CreateNotificationInput,
  ClassroomAbuseReport,
  CreateAbuseReportInput,
  AbuseReportStatus,
} from "./communicationTypes";

// ==============================================================================
// In-Memory Fallback Stores (Unit tests & offline operation)
// ==============================================================================
const memAnnouncements = new Map<string, ClassroomAnnouncement[]>(); // classroomId -> announcements
const memDiscussions = new Map<string, ClassroomDiscussionPost[]>(); // contextKey -> posts
const memNotifications = new Map<string, ClassroomNotification[]>(); // recipientId -> notifications
const memAbuseReports = new Map<string, ClassroomAbuseReport[]>(); // classroomId -> reports

export function _resetCommunicationMemory(): void {
  memAnnouncements.clear();
  memDiscussions.clear();
  memNotifications.clear();
  memAbuseReports.clear();
}

function discussionContextKey(classroomId: string, assignmentId?: string, groupId?: string): string {
  if (groupId) return `${classroomId}:group:${groupId}`;
  if (assignmentId) return `${classroomId}:assignment:${assignmentId}`;
  return `${classroomId}:general`;
}

// ==============================================================================
// 1. Announcements
// ==============================================================================

export async function createAnnouncement(
  classroomId: string,
  teacherId: string,
  input: CreateAnnouncementInput
): Promise<{ success: boolean; announcement?: ClassroomAnnouncement; error?: string }> {
  const access = await getClassroom(teacherId, classroomId);
  if (!access.success || !access.isTeacher) {
    return { success: false, error: "Only the classroom instructor can post announcements." };
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_announcements")
        .insert({
          classroom_id: classroomId,
          author_id: teacherId,
          title: input.title.trim(),
          content: input.content.trim(),
          is_pinned: Boolean(input.isPinned),
        })
        .select()
        .single();

      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any;
        return {
          success: true,
          announcement: {
            id: d.id,
            classroomId: d.classroom_id,
            authorId: d.author_id,
            title: d.title,
            content: d.content,
            isPinned: d.is_pinned,
            createdAt: d.created_at,
            updatedAt: d.updated_at,
          },
        };
      }
      console.warn("Failed creating announcement in database:", error?.message);
      return { success: false, error: error?.message || "Failed to create announcement in database." };
    } catch (err: unknown) {
      console.warn("Database error creating announcement:", err);
      return { success: false, error: "Database error occurred while creating announcement." };
    }
  }

  if (isAuthConfigured()) {
    return { success: false, error: "Durable database client is unavailable. Cannot save announcement to transient memory." };
  }

  const announcement: ClassroomAnnouncement = {
    id: `ann-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    classroomId,
    authorId: teacherId,
    title: input.title.trim(),
    content: input.content.trim(),
    isPinned: Boolean(input.isPinned),
    createdAt: now,
    updatedAt: now,
  };

  const existing = memAnnouncements.get(classroomId) ?? [];
  memAnnouncements.set(classroomId, [announcement, ...existing]);
  return { success: true, announcement };
}

export async function listAnnouncements(
  classroomId: string,
  userId: string
): Promise<{ success: boolean; announcements?: ClassroomAnnouncement[]; error?: string }> {
  const access = await getClassroom(userId, classroomId);
  if (!access.success) {
    return { success: false, error: access.error ?? "Access denied to classroom." };
  }

  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_announcements")
        .select("*, profiles:author_id(display_name)")
        .eq("classroom_id", classroomId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list: ClassroomAnnouncement[] = (data as any[]).map((d) => ({
          id: d.id,
          classroomId: d.classroom_id,
          authorId: d.author_id,
          title: d.title,
          content: d.content,
          isPinned: d.is_pinned,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          authorName: Array.isArray(d.profiles) ? d.profiles[0]?.display_name : d.profiles?.display_name,
        }));
        return { success: true, announcements: list };
      }
    } catch {
      // Fall through
    }
  }

  const list = memAnnouncements.get(classroomId) ?? [];
  // Sort pinned first, then chronological desc
  const sorted = [...list].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  return { success: true, announcements: sorted };
}

// ==============================================================================
// 2. Discussions (Assignment Threads & Private Group Chats)
// ==============================================================================

export async function createDiscussionPost(
  classroomId: string,
  userId: string,
  input: CreateDiscussionPostInput
): Promise<{ success: boolean; post?: ClassroomDiscussionPost; error?: string }> {
  const access = await getClassroom(userId, classroomId);
  if (!access.success) {
    return { success: false, error: "Access denied. You must be enrolled in this classroom." };
  }

  // If group discussion, verify user belongs to the group or is the classroom teacher
  if (input.groupId) {
    const isTeacher = access.isTeacher;
    if (!isTeacher) {
      const isMember = await checkGroupMembership(input.groupId, userId);
      if (!isMember) {
        return { success: false, error: "Access denied. You are not a member of this collaboration group." };
      }
    }
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_discussions")
        .insert({
          classroom_id: classroomId,
          assignment_id: input.assignmentId ?? null,
          group_id: input.groupId ?? null,
          author_id: userId,
          parent_id: input.parentId ?? null,
          content: input.content.trim(),
        })
        .select()
        .single();

      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any;
        return {
          success: true,
          post: {
            id: d.id,
            classroomId: d.classroom_id,
            assignmentId: d.assignment_id ?? undefined,
            groupId: d.group_id ?? undefined,
            authorId: d.author_id,
            parentId: d.parent_id ?? undefined,
            content: d.content,
            isHiddenByModerator: d.is_hidden_by_moderator,
            hiddenReason: d.hidden_reason ?? undefined,
            createdAt: d.created_at,
            updatedAt: d.updated_at,
          },
        };
      }
      console.warn("Failed creating discussion post in database:", error?.message);
      return { success: false, error: error?.message || "Failed to create discussion post in database." };
    } catch (err: unknown) {
      console.warn("Database error creating discussion post:", err);
      return { success: false, error: "Database error occurred while creating discussion post." };
    }
  }

  if (isAuthConfigured()) {
    return { success: false, error: "Durable database client is unavailable. Cannot save discussion post to transient memory." };
  }

  const post: ClassroomDiscussionPost = {
    id: `disc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    classroomId,
    assignmentId: input.assignmentId,
    groupId: input.groupId,
    authorId: userId,
    parentId: input.parentId,
    content: input.content.trim(),
    isHiddenByModerator: false,
    createdAt: now,
    updatedAt: now,
  };

  const key = discussionContextKey(classroomId, input.assignmentId, input.groupId);
  const existing = memDiscussions.get(key) ?? [];
  memDiscussions.set(key, [...existing, post]);

  return { success: true, post };
}

export async function listDiscussionPosts(
  classroomId: string,
  userId: string,
  assignmentId?: string,
  groupId?: string
): Promise<{ success: boolean; posts?: ClassroomDiscussionPost[]; error?: string }> {
  const access = await getClassroom(userId, classroomId);
  if (!access.success) {
    return { success: false, error: "Access denied." };
  }

  // If group posts are requested, enforce strict group privacy
  if (groupId) {
    const isTeacher = access.isTeacher;
    if (!isTeacher) {
      const isMember = await checkGroupMembership(groupId, userId);
      if (!isMember) {
        return { success: false, error: "Access denied. You cannot view discussion of other groups." };
      }
    }
  }

  const admin = createAdminClient();
  if (admin) {
    try {
      let query = admin
        .from("classroom_discussions")
        .select("*, profiles:author_id(display_name)")
        .eq("classroom_id", classroomId)
        .order("created_at", { ascending: true });

      if (groupId) {
        query = query.eq("group_id", groupId);
      } else if (assignmentId) {
        query = query.eq("assignment_id", assignmentId).is("group_id", null);
      } else {
        query = query.is("assignment_id", null).is("group_id", null);
      }

      // Hide moderated posts for non-instructors
      if (!access.isTeacher) {
        query = query.eq("is_hidden_by_moderator", false);
      }

      const { data, error } = await query;
      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const posts: ClassroomDiscussionPost[] = (data as any[]).map((d) => ({
          id: d.id,
          classroomId: d.classroom_id,
          assignmentId: d.assignment_id ?? undefined,
          groupId: d.group_id ?? undefined,
          authorId: d.author_id,
          parentId: d.parent_id ?? undefined,
          content: d.content,
          isHiddenByModerator: d.is_hidden_by_moderator,
          hiddenReason: d.hidden_reason ?? undefined,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          authorName: Array.isArray(d.profiles) ? d.profiles[0]?.display_name : d.profiles?.display_name,
        }));
        return { success: true, posts };
      }
    } catch {
      // Memory fallback below
    }
  }

  const key = discussionContextKey(classroomId, assignmentId, groupId);
  const posts = memDiscussions.get(key) ?? [];
  const visible = access.isTeacher ? posts : posts.filter((p) => !p.isHiddenByModerator);
  return { success: true, posts: visible };
}

// In-memory group membership helper for unit testing
const memTestGroupMembers = new Map<string, Set<string>>(); // groupId -> set of userIds

export function _setGroupMember(groupId: string, userId: string): void {
  const set = memTestGroupMembers.get(groupId) ?? new Set<string>();
  set.add(userId);
  memTestGroupMembers.set(groupId, set);
}

async function checkGroupMembership(groupId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_group_members")
        .select("user_id")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data) return true;
    } catch {
      // Fall through
    }
  }

  const set = memTestGroupMembers.get(groupId);
  return Boolean(set?.has(userId));
}

// ==============================================================================
// 3. Notifications
// ==============================================================================

export async function createNotification(
  input: CreateNotificationInput
): Promise<{ success: boolean; notification?: ClassroomNotification; error?: string }> {
  const now = new Date().toISOString();
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_notifications")
        .insert({
          recipient_id: input.recipientId,
          classroom_id: input.classroomId,
          type: input.type,
          title: input.title,
          message: input.message,
          link: input.link ?? null,
        })
        .select()
        .single();

      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any;
        return {
          success: true,
          notification: {
            id: d.id,
            recipientId: d.recipient_id,
            classroomId: d.classroom_id,
            type: d.type,
            title: d.title,
            message: d.message,
            link: d.link ?? undefined,
            isRead: d.is_read,
            createdAt: d.created_at,
          },
        };
      }
      console.warn("Failed creating notification in database:", error?.message);
      return { success: false, error: error?.message || "Failed to create notification in database." };
    } catch (err: unknown) {
      console.warn("Database error creating notification:", err);
      return { success: false, error: "Database error occurred while creating notification." };
    }
  }

  if (isAuthConfigured()) {
    return { success: false, error: "Durable database client is unavailable. Cannot save notification to transient memory." };
  }

  const notif: ClassroomNotification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    recipientId: input.recipientId,
    classroomId: input.classroomId,
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link,
    isRead: false,
    createdAt: now,
  };

  const list = memNotifications.get(input.recipientId) ?? [];
  memNotifications.set(input.recipientId, [notif, ...list]);
  return { success: true, notification: notif };
}

export async function listUserNotifications(
  recipientId: string
): Promise<{ success: boolean; notifications?: ClassroomNotification[] }> {
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_notifications")
        .select("*")
        .eq("recipient_id", recipientId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list: ClassroomNotification[] = (data as any[]).map((d) => ({
          id: d.id,
          recipientId: d.recipient_id,
          classroomId: d.classroom_id,
          type: d.type,
          title: d.title,
          message: d.message,
          link: d.link ?? undefined,
          isRead: d.is_read,
          createdAt: d.created_at,
        }));
        return { success: true, notifications: list };
      }
    } catch {
      // Memory fallback below
    }
  }

  const list = memNotifications.get(recipientId) ?? [];
  return { success: true, notifications: list };
}

export async function markNotificationAsRead(
  notificationId: string,
  recipientId: string
): Promise<{ success: boolean }> {
  const admin = createAdminClient();
  if (admin) {
    try {
      await admin
        .from("classroom_notifications")
        .update({ is_read: true })
        .eq("id", notificationId)
        .eq("recipient_id", recipientId);
      return { success: true };
    } catch {
      // Fall through
    }
  }

  const list = memNotifications.get(recipientId) ?? [];
  const target = list.find((n) => n.id === notificationId);
  if (target) {
    target.isRead = true;
  }
  return { success: true };
}

// ==============================================================================
// 4. Abuse Reporting & Moderation
// ==============================================================================

export async function submitAbuseReport(
  reporterId: string,
  input: CreateAbuseReportInput
): Promise<{ success: boolean; report?: ClassroomAbuseReport; error?: string }> {
  const access = await getClassroom(reporterId, input.classroomId);
  if (!access.success) {
    return { success: false, error: "You must be a member of this classroom to submit a report." };
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_abuse_reports")
        .insert({
          reporter_id: reporterId,
          classroom_id: input.classroomId,
          target_type: input.targetType,
          target_id: input.targetId,
          reason: input.reason,
          details: input.details ?? null,
        })
        .select()
        .single();

      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any;
        return {
          success: true,
          report: {
            id: d.id,
            reporterId: d.reporter_id,
            classroomId: d.classroom_id,
            targetType: d.target_type,
            targetId: d.target_id,
            reason: d.reason,
            details: d.details ?? undefined,
            status: d.status,
            createdAt: d.created_at,
          },
        };
      }
    } catch {
      // Memory fallback below
    }
  }

  const report: ClassroomAbuseReport = {
    id: `rep-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    reporterId,
    classroomId: input.classroomId,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    details: input.details,
    status: "pending",
    createdAt: now,
  };

  const list = memAbuseReports.get(input.classroomId) ?? [];
  memAbuseReports.set(input.classroomId, [report, ...list]);
  return { success: true, report };
}

export async function resolveAbuseReport(
  reportId: string,
  moderatorId: string,
  classroomId: string,
  status: AbuseReportStatus,
  moderatorNotes?: string,
  hideContent?: boolean
): Promise<{ success: boolean; error?: string }> {
  const access = await getClassroom(moderatorId, classroomId);
  if (!access.success || !access.isTeacher) {
    return { success: false, error: "Instructor access required to moderate abuse reports." };
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();
  if (admin) {
    try {
      await admin
        .from("classroom_abuse_reports")
        .update({
          status,
          moderated_by: moderatorId,
          moderator_notes: moderatorNotes ?? null,
          resolved_at: now,
        })
        .eq("id", reportId)
        .eq("classroom_id", classroomId);

      if (hideContent) {
        // Locate target post and hide it
        const { data: rep } = await admin
          .from("classroom_abuse_reports")
          .select("target_type, target_id")
          .eq("id", reportId)
          .single();

        if (rep?.target_type === "discussion") {
          await admin
            .from("classroom_discussions")
            .update({
              is_hidden_by_moderator: true,
              hidden_reason: moderatorNotes ?? "Removed by instructor for policy violation.",
            })
            .eq("id", rep.target_id);
        }
      }

      return { success: true };
    } catch {
      // Memory fallback below
    }
  }

  const list = memAbuseReports.get(classroomId) ?? [];
  const rep = list.find((r) => r.id === reportId);
  if (rep) {
    rep.status = status;
    rep.moderatedBy = moderatorId;
    rep.moderatorNotes = moderatorNotes;
    rep.resolvedAt = now;

    if (hideContent && rep.targetType === "discussion") {
      for (const posts of memDiscussions.values()) {
        const p = posts.find((post) => post.id === rep.targetId);
        if (p) {
          p.isHiddenByModerator = true;
          p.hiddenReason = moderatorNotes ?? "Removed by instructor.";
        }
      }
    }
  }

  return { success: true };
}
