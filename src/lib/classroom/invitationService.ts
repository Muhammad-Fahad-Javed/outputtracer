/**
 * invitationService.ts
 *
 * Core service for:
 * 1. Single-use expiring invitation tokens
 * 2. Token generation, validation, and acceptance
 * 3. Revocation and status management
 * 4. Email delivery provider abstraction
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthConfigured } from "@/lib/supabase/env";
import { getClassroom, addClassroomMember } from "./classroomService";
import type { ClassroomInvitation } from "./communicationTypes";
import { sendTransactionalEmail } from "./emailProvider";

// ==============================================================================
// In-Memory Fallback Stores (Unit tests & offline operation)
// ==============================================================================
const memInvitations = new Map<string, ClassroomInvitation>(); // token -> invitation

export function _resetInvitationMemory(): void {
  memInvitations.clear();
}

function generateInvitationToken(): string {
  const chars = "abcdef0123456789";
  let token = "";
  for (let i = 0; i < 48; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// ==============================================================================
// 1. Create Invitation
// ==============================================================================

export async function createInvitation(
  classroomId: string,
  invitedBy: string,
  inviteeEmail: string
): Promise<{ success: boolean; invitation?: ClassroomInvitation; error?: string }> {
  const email = inviteeEmail.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email) || email.length > 254) {
    return { success: false, error: "Invalid recipient email address format." };
  }

  const access = await getClassroom(invitedBy, classroomId);
  if (!access.success || !access.isTeacher) {
    return { success: false, error: "Only the classroom instructor can issue invitations." };
  }

  const token = generateInvitationToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  if (isAuthConfigured()) {
    const admin = createAdminClient();
    if (admin) {
      // Check existing pending invitation
      const { data: existing } = await admin
        .from("classroom_invitations")
        .select("id, status")
        .eq("classroom_id", classroomId)
        .eq("invitee_email", email)
        .eq("status", "pending")
        .maybeSingle();

      if (existing) {
        return { success: false, error: "A pending invitation already exists for this email address." };
      }

      const { data, error } = await admin
        .from("classroom_invitations")
        .insert({
          classroom_id: classroomId,
          invited_by: invitedBy,
          invitee_email: email,
          token,
          status: "pending",
          expires_at: expiresAt,
        })
        .select(`
          id,
          classroom_id,
          invited_by,
          invitee_email,
          token,
          status,
          accepted_by,
          expires_at,
          created_at,
          updated_at,
          inviter:profiles!classroom_invitations_invited_by_fkey(full_name, username)
        `)
        .single();

      if (!error && data) {
        const row = data as Record<string, unknown>;
        const inviterProfile = row.inviter as Record<string, unknown> | null;
        const invitation: ClassroomInvitation = {
          id: String(row.id),
          classroomId: String(row.classroom_id),
          invitedBy: String(row.invited_by),
          invitedByName: String(inviterProfile?.full_name || inviterProfile?.username || "Instructor"),
          inviteeEmail: String(row.invitee_email),
          token: String(row.token),
          status: "pending",
          expiresAt: String(row.expires_at),
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        };

        // Dispatch transactional email via configured provider or mock
        await sendTransactionalEmail({
          to: email,
          subject: `Classroom Invitation: Join ${access.classroom?.name || "Classroom"} on OutputTracer`,
          html: `
            <p>Hello,</p>
            <p>You have been invited by <strong>${invitation.invitedByName}</strong> to join <strong>${access.classroom?.name || "the classroom"}</strong> on OutputTracer.</p>
            <p><a href="https://outputtracer.com/classroom/invite/${invitation.token}" style="display:inline-block;padding:8px 16px;background:#000;color:#fff;text-decoration:none;border-radius:4px;font-size:12px;">Accept Invitation</a></p>
            <p>This single-use invitation expires in 7 days.</p>
          `,
        });

        return { success: true, invitation };
      }
    }
  }

  // Memory fallback
  const fallbackInvitation: ClassroomInvitation = {
    id: `inv-${Date.now()}`,
    classroomId,
    invitedBy,
    invitedByName: "Instructor",
    inviteeEmail: email,
    token,
    status: "pending",
    expiresAt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  memInvitations.set(token, fallbackInvitation);
  return { success: true, invitation: fallbackInvitation };
}

// ==============================================================================
// 2. Get Invitation Details by Token
// ==============================================================================

export async function getInvitationByToken(
  token: string
): Promise<{ success: boolean; invitation?: ClassroomInvitation; classroomName?: string; teacherName?: string; error?: string }> {
  if (!token) {
    return { success: false, error: "Invitation token required" };
  }

  if (isAuthConfigured()) {
    const admin = createAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from("classroom_invitations")
        .select(`
          id,
          classroom_id,
          invited_by,
          invitee_email,
          token,
          status,
          accepted_by,
          expires_at,
          created_at,
          updated_at,
          classroom:classrooms(name, subject, description),
          inviter:profiles!classroom_invitations_invited_by_fkey(full_name, username)
        `)
        .eq("token", token)
        .maybeSingle();

      if (!error && data) {
        const row = data as Record<string, unknown>;
        const cl = row.classroom as Record<string, unknown> | null;
        const inviter = row.inviter as Record<string, unknown> | null;

        const isExpired = new Date(String(row.expires_at)) < new Date();
        const currentStatus = isExpired && row.status === "pending" ? "expired" : (row.status as ClassroomInvitation["status"]);

        const invitation: ClassroomInvitation = {
          id: String(row.id),
          classroomId: String(row.classroom_id),
          invitedBy: String(row.invited_by),
          invitedByName: String(inviter?.full_name || inviter?.username || "Instructor"),
          inviteeEmail: String(row.invitee_email),
          token: String(row.token),
          status: currentStatus,
          acceptedBy: row.accepted_by ? String(row.accepted_by) : undefined,
          expiresAt: String(row.expires_at),
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        };

        return {
          success: true,
          invitation,
          classroomName: String(cl?.name || "Classroom"),
          teacherName: String(inviter?.full_name || inviter?.username || "Instructor"),
        };
      }
    }
  }

  // Memory fallback
  const item = memInvitations.get(token);
  if (item) {
    return {
      success: true,
      invitation: item,
      classroomName: "Demo Computer Science",
      teacherName: "Demo Instructor",
    };
  }

  return { success: false, error: "Invitation not found or invalid token." };
}

// ==============================================================================
// 3. Accept Invitation
// ==============================================================================

export async function acceptInvitation(
  token: string,
  userId: string
): Promise<{ success: boolean; classroomId?: string; error?: string }> {
  if (isAuthConfigured()) {
    const admin = createAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from("classroom_invitations")
        .select("*")
        .eq("token", token)
        .maybeSingle();

      if (error || !data) {
        return { success: false, error: "Invalid invitation token." };
      }

      if (data.status !== "pending") {
        return { success: false, error: `This invitation has already been ${data.status}.` };
      }

      if (new Date(data.expires_at) < new Date()) {
        await admin.from("classroom_invitations").update({ status: "expired" }).eq("id", data.id);
        return { success: false, error: "This invitation link has expired." };
      }

      // Add student to classroom
      const addRes = await addClassroomMember(data.classroom_id, userId, "student");
      if (!addRes.success && addRes.error !== "User is already enrolled in this classroom.") {
        return { success: false, error: addRes.error || "Failed joining classroom." };
      }

      // Update invitation
      await admin
        .from("classroom_invitations")
        .update({
          status: "accepted",
          accepted_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);

      return { success: true, classroomId: data.classroom_id };
    }
  }

  // Memory fallback
  const item = memInvitations.get(token);
  if (!item) return { success: false, error: "Invalid invitation token." };
  item.status = "accepted";
  item.acceptedBy = userId;
  return { success: true, classroomId: item.classroomId };
}

// ==============================================================================
// 4. Revoke Invitation
// ==============================================================================

export async function revokeInvitation(
  invitationId: string,
  revokedBy: string
): Promise<{ success: boolean; error?: string }> {
  if (isAuthConfigured()) {
    const admin = createAdminClient();
    if (admin) {
      const { data: inv } = await admin
        .from("classroom_invitations")
        .select("classroom_id")
        .eq("id", invitationId)
        .maybeSingle();

      if (!inv) return { success: false, error: "Invitation not found." };

      const access = await getClassroom(revokedBy, inv.classroom_id);
      if (!access.success || !access.isTeacher) {
        return { success: false, error: "Only the classroom instructor can revoke invitations." };
      }

      await admin
        .from("classroom_invitations")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("id", invitationId);

      return { success: true };
    }
  }

  return { success: true };
}

// ==============================================================================
// 5. List Classroom Invitations
// ==============================================================================

export async function listClassroomInvitations(
  classroomId: string,
  requesterId: string
): Promise<{ success: boolean; invitations: ClassroomInvitation[]; error?: string }> {
  const access = await getClassroom(requesterId, classroomId);
  if (!access.success || !access.isTeacher) {
    return { success: false, invitations: [], error: "Access denied." };
  }

  if (isAuthConfigured()) {
    const admin = createAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from("classroom_invitations")
        .select(`
          id,
          classroom_id,
          invited_by,
          invitee_email,
          token,
          status,
          accepted_by,
          expires_at,
          created_at,
          updated_at,
          inviter:profiles!classroom_invitations_invited_by_fkey(full_name, username)
        `)
        .eq("classroom_id", classroomId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        const now = new Date();
        const invitations: ClassroomInvitation[] = data.map((item: unknown) => {
          const row = item as Record<string, unknown>;
          const inviter = row.inviter as Record<string, unknown> | null;
          const isExpired = new Date(String(row.expires_at)) < now && row.status === "pending";

          return {
            id: String(row.id),
            classroomId: String(row.classroom_id),
            invitedBy: String(row.invited_by),
            invitedByName: String(inviter?.full_name || inviter?.username || "Instructor"),
            inviteeEmail: String(row.invitee_email),
            token: String(row.token),
            status: isExpired ? "expired" : (row.status as ClassroomInvitation["status"]),
            acceptedBy: row.accepted_by ? String(row.accepted_by) : undefined,
            expiresAt: String(row.expires_at),
            createdAt: String(row.created_at),
            updatedAt: String(row.updated_at),
          };
        });

        return { success: true, invitations };
      }
    }
  }

  // Memory fallback
  const list = Array.from(memInvitations.values()).filter((i) => i.classroomId === classroomId);
  return { success: true, invitations: list };
}
