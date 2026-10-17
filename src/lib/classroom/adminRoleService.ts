/**
 * adminRoleService.ts
 *
 * Core service for:
 * 1. Inviting new administrators (single-use 3-day expiring token)
 * 2. Accepting admin invitations with promotion to app_roles table
 * 3. Listing, searching, and managing platform users and roles
 * 4. Revoking admin invitations
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/learn/db";
import { isAuthConfigured } from "@/lib/supabase/env";

export interface AdminInvitation {
  id: string;
  invitedBy: string;
  invitedByName?: string;
  inviteeEmail: string;
  token: string;
  role: "admin" | "staff";
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
}

export interface UserRoleRecord {
  userId: string;
  email: string;
  displayName: string;
  role: "admin" | "teacher" | "student";
  createdAt: string;
}

// In-memory fallback
const memAdminInvitations: AdminInvitation[] = [];

export function _resetAdminInvitationsMemory(): void {
  memAdminInvitations.length = 0;
}

export async function createAdminInvitation(
  actorAdminId: string,
  inviteeEmail: string,
  role: "admin" | "staff" = "admin"
): Promise<{ success: boolean; invitation?: AdminInvitation; error?: string }> {
  const isAdmin = await checkIsAdmin(actorAdminId);
  if (!isAdmin) {
    return { success: false, error: "Only platform administrators can invite new administrators." };
  }

  const email = inviteeEmail.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return { success: false, error: "Invalid recipient email address format." };
  }

  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  if (isAuthConfigured()) {
    const admin = createAdminClient();
    if (admin) {
      // Check for duplicate pending invitation
      const { data: existing } = await admin
        .from("admin_invitations")
        .select("id")
        .eq("invitee_email", email)
        .eq("status", "pending")
        .maybeSingle();

      if (existing) {
        return { success: false, error: "A pending administrator invitation already exists for this email." };
      }

      const { data, error } = await admin
        .from("admin_invitations")
        .insert({
          invited_by: actorAdminId,
          invitee_email: email,
          token,
          role,
          status: "pending",
          expires_at: expiresAt,
        })
        .select(`
          id,
          invited_by,
          invitee_email,
          token,
          role,
          status,
          expires_at,
          created_at,
          inviter:profiles!admin_invitations_invited_by_fkey(full_name, username)
        `)
        .single();

      if (!error && data) {
        const row = data as Record<string, unknown>;
        const inviter = row.inviter as Record<string, unknown> | null;
        return {
          success: true,
          invitation: {
            id: String(row.id),
            invitedBy: String(row.invited_by),
            invitedByName: String(inviter?.full_name || inviter?.username || "Administrator"),
            inviteeEmail: String(row.invitee_email),
            token: String(row.token),
            role: row.role as "admin" | "staff",
            status: "pending",
            expiresAt: String(row.expires_at),
            createdAt: String(row.created_at),
          },
        };
      }
    }
  }

  // Memory fallback
  const fallbackInv: AdminInvitation = {
    id: `admin-inv-${Date.now()}`,
    invitedBy: actorAdminId,
    invitedByName: "Administrator",
    inviteeEmail: email,
    token,
    role,
    status: "pending",
    expiresAt,
    createdAt: new Date().toISOString(),
  };
  memAdminInvitations.push(fallbackInv);
  return { success: true, invitation: fallbackInv };
}

export async function listAdminInvitations(
  actorAdminId: string
): Promise<{ success: boolean; invitations: AdminInvitation[]; error?: string }> {
  const isAdmin = await checkIsAdmin(actorAdminId);
  if (!isAdmin) {
    return { success: false, invitations: [], error: "Administrator authorization required." };
  }

  if (isAuthConfigured()) {
    const admin = createAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from("admin_invitations")
        .select(`
          id,
          invited_by,
          invitee_email,
          token,
          role,
          status,
          expires_at,
          created_at,
          inviter:profiles!admin_invitations_invited_by_fkey(full_name, username)
        `)
        .order("created_at", { ascending: false });

      if (!error && data) {
        const now = new Date();
        const invitations: AdminInvitation[] = data.map((item: unknown) => {
          const row = item as Record<string, unknown>;
          const inviter = row.inviter as Record<string, unknown> | null;
          const isExpired = new Date(String(row.expires_at)) < now && row.status === "pending";

          return {
            id: String(row.id),
            invitedBy: String(row.invited_by),
            invitedByName: String(inviter?.full_name || inviter?.username || "Administrator"),
            inviteeEmail: String(row.invitee_email),
            token: String(row.token),
            role: row.role as "admin" | "staff",
            status: isExpired ? "expired" : (row.status as AdminInvitation["status"]),
            expiresAt: String(row.expires_at),
            createdAt: String(row.created_at),
          };
        });
        return { success: true, invitations };
      }
    }
  }

  return { success: true, invitations: [...memAdminInvitations] };
}

export async function acceptAdminInvitation(
  token: string,
  userId: string,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  if (isAuthConfigured()) {
    const admin = createAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from("admin_invitations")
        .select("*")
        .eq("token", token)
        .maybeSingle();

      if (error || !data) {
        return { success: false, error: "Invalid admin invitation token." };
      }

      if (data.status !== "pending") {
        return { success: false, error: `This invitation is already ${data.status}.` };
      }

      if (new Date(data.expires_at) < new Date()) {
        await admin.from("admin_invitations").update({ status: "expired" }).eq("id", data.id);
        return { success: false, error: "This admin invitation link has expired." };
      }

      // Verify email matches
      if (data.invitee_email.toLowerCase() !== userEmail.toLowerCase()) {
        return {
          success: false,
          error: `This invitation was issued to ${data.invitee_email}. You are currently signed in as ${userEmail}.`,
        };
      }

      // Add to app_roles
      await admin.from("app_roles").upsert(
        {
          user_id: userId,
          role: data.role || "admin",
        },
        { onConflict: "user_id,role" }
      );

      // Update invitation record
      await admin.from("admin_invitations").update({
        status: "accepted",
        accepted_by: userId,
        updated_at: new Date().toISOString(),
      }).eq("id", data.id);

      return { success: true };
    }
  }

  return { success: true };
}

export async function revokeAdminInvitation(
  actorAdminId: string,
  invitationId: string
): Promise<{ success: boolean; error?: string }> {
  const isAdmin = await checkIsAdmin(actorAdminId);
  if (!isAdmin) {
    return { success: false, error: "Administrator authorization required." };
  }

  if (isAuthConfigured()) {
    const admin = createAdminClient();
    if (admin) {
      await admin
        .from("admin_invitations")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("id", invitationId);
      return { success: true };
    }
  }

  const idx = memAdminInvitations.findIndex((i) => i.id === invitationId);
  if (idx !== -1) {
    memAdminInvitations[idx].status = "revoked";
  }
  return { success: true };
}
