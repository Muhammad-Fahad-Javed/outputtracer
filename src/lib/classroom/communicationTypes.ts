// ==============================================================================
// Phase 4 Communication, Notification, & Moderation Types
// ==============================================================================

export interface ClassroomAnnouncement {
  id: string;
  classroomId: string;
  authorId: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  authorName?: string;
}

export interface CreateAnnouncementInput {
  title: string;
  content: string;
  isPinned?: boolean;
}

export interface ClassroomDiscussionPost {
  id: string;
  classroomId: string;
  assignmentId?: string;
  groupId?: string;
  authorId: string;
  authorName?: string;
  parentId?: string;
  content: string;
  isHiddenByModerator: boolean;
  hiddenReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDiscussionPostInput {
  content: string;
  assignmentId?: string;
  groupId?: string;
  parentId?: string;
}

export type NotificationType =
  | "grade"
  | "feedback"
  | "announcement"
  | "mention"
  | "deadline"
  | "system";

export interface ClassroomNotification {
  id: string;
  recipientId: string;
  classroomId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export interface CreateNotificationInput {
  recipientId: string;
  classroomId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

export type AbuseReportReason =
  | "spam"
  | "harassment"
  | "inappropriate_content"
  | "academic_dishonesty"
  | "other";

export type AbuseReportStatus = "pending" | "resolved" | "dismissed";

export interface ClassroomAbuseReport {
  id: string;
  reporterId: string;
  classroomId: string;
  targetType: "discussion" | "comment" | "announcement";
  targetId: string;
  reason: AbuseReportReason;
  details?: string;
  status: AbuseReportStatus;
  moderatedBy?: string;
  moderatorNotes?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface CreateAbuseReportInput {
  classroomId: string;
  targetType: "discussion" | "comment" | "announcement";
  targetId: string;
  reason: AbuseReportReason;
  details?: string;
}


// ==============================================================================
// Phase 5: Private Messaging & Invitation Tokens
// ==============================================================================

export interface ClassroomMessage {
  id: string;
  classroomId: string;
  senderId: string;
  senderName?: string;
  recipientId?: string;
  recipientName?: string;
  content: string;
  isGroupMessage: boolean;
  isRead: boolean;
  createdAt: string;
}

export interface SendMessageInput {
  clientRequestId?: string;
  recipientId?: string; // null/undefined = group message
  content: string;
}

export interface ClassroomInvitation {
  id: string;
  classroomId: string;
  invitedBy: string;
  invitedByName?: string;
  inviteeEmail: string;
  token: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  acceptedBy?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvitationInput {
  inviteeEmail: string;
}
