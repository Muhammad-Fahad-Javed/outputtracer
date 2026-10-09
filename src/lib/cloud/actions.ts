"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DEFAULT_CODE } from "@/lib/examples";
import { isUuid } from "@/lib/cloud/roles";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; notice?: string } | null;

async function clientOrLogin() {
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

function asError(error: { message: string } | null): ActionState {
  if (!error) return {};
  return { error: error.message };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect("/");
}

export async function createProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await clientOrLogin();
  if (!supabase) return { error: "Cloud storage is not configured." };
  const groupRaw = String(formData.get("groupId") || "");
  const { data, error } = await supabase.rpc("create_project", {
    p_title: String(formData.get("title") || ""),
    p_standard: String(formData.get("standard") || "c++17"),
    p_group: groupRaw && isUuid(groupRaw) ? groupRaw : null,
    p_main: DEFAULT_CODE,
  });
  if (error || !data) return asError(error || { message: "Could not create the project." });
  revalidatePath("/projects");
  redirect(`/p/${data}`);
}

export async function renameProject(projectId: string, title: string): Promise<ActionState> {
  const supabase = await clientOrLogin();
  if (!supabase || !isUuid(projectId)) return { error: "Could not rename the project." };
  const { error } = await supabase.rpc("rename_project", { pid: projectId, p_title: title });
  if (error) return asError(error);
  revalidatePath(`/p/${projectId}`);
  revalidatePath("/projects");
  return { notice: "Renamed." };
}

export async function deleteProject(projectId: string): Promise<ActionState> {
  const supabase = await clientOrLogin();
  if (!supabase || !isUuid(projectId)) return { error: "Could not delete the project." };
  const { error } = await supabase.rpc("delete_project", { pid: projectId });
  if (error) return asError(error);
  revalidatePath("/projects");
  redirect("/projects");
}

export async function inviteToProject(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await clientOrLogin();
  if (!supabase) return { error: "Cloud storage is not configured." };
  const projectId = String(formData.get("projectId") || "");
  const { data, error } = await supabase.rpc("invite_to_project", {
    pid: projectId,
    target_email: String(formData.get("email") || ""),
    target_role: String(formData.get("role") || "editor"),
  });
  if (error) return asError(error);
  revalidatePath(`/p/${projectId}`);
  return {
    notice:
      data === "pending"
        ? "Saved. They join when they sign up with that email."
        : "Added to the project.",
  };
}

export async function setMemberRole(
  projectId: string,
  userId: string,
  role: string
): Promise<ActionState> {
  const supabase = await clientOrLogin();
  if (!supabase) return { error: "Cloud storage is not configured." };
  const { error } = await supabase.rpc("set_member_role", {
    pid: projectId,
    target: userId,
    target_role: role,
  });
  if (error) return asError(error);
  revalidatePath(`/p/${projectId}`);
  return { notice: "Role updated." };
}

export async function removeProjectMember(projectId: string, userId: string): Promise<ActionState> {
  const supabase = await clientOrLogin();
  if (!supabase) return { error: "Cloud storage is not configured." };
  const { error } = await supabase.rpc("remove_project_member", {
    pid: projectId,
    target: userId,
  });
  if (error) return asError(error);
  revalidatePath(`/p/${projectId}`);
  revalidatePath("/projects");
  return { notice: "Removed." };
}

export async function updateDisplayName(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await clientOrLogin();
  if (!supabase) return { error: "Cloud storage is not configured." };
  const { error } = await supabase.rpc("update_display_name", {
    p_name: String(formData.get("displayName") || ""),
  });
  if (error) return asError(error);
  revalidatePath("/projects");
  return { notice: "Name saved." };
}

export async function createGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await clientOrLogin();
  if (!supabase) return { error: "Cloud storage is not configured." };
  const { data, error } = await supabase.rpc("create_group", {
    p_name: String(formData.get("name") || ""),
  });
  if (error || !data) return asError(error || { message: "Could not create the group." });
  revalidatePath("/groups");
  redirect(`/groups/${data}`);
}

export async function inviteToGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await clientOrLogin();
  if (!supabase) return { error: "Cloud storage is not configured." };
  const groupId = String(formData.get("groupId") || "");
  const { data, error } = await supabase.rpc("invite_to_group", {
    gid: groupId,
    target_email: String(formData.get("email") || ""),
  });
  if (error) return asError(error);
  revalidatePath(`/groups/${groupId}`);
  return {
    notice:
      data === "pending"
        ? "Saved. They join when they sign up with that email."
        : "Added to the group.",
  };
}

export async function removeGroupMember(groupId: string, userId: string): Promise<ActionState> {
  const supabase = await clientOrLogin();
  if (!supabase) return { error: "Cloud storage is not configured." };
  const { error } = await supabase.rpc("remove_group_member", { gid: groupId, target: userId });
  if (error) return asError(error);
  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/groups");
  return {};
}

export async function deleteGroup(groupId: string): Promise<ActionState> {
  const supabase = await clientOrLogin();
  if (!supabase) return { error: "Cloud storage is not configured." };
  const { error } = await supabase.rpc("delete_group", { gid: groupId });
  if (error) return asError(error);
  revalidatePath("/groups");
  redirect("/groups");
}

export async function renameGroup(groupId: string, name: string): Promise<ActionState> {
  const supabase = await clientOrLogin();
  if (!supabase) return { error: "Cloud storage is not configured." };
  const { error } = await supabase.rpc("rename_group", { gid: groupId, p_name: name });
  if (error) return asError(error);
  revalidatePath(`/groups/${groupId}`);
  return { notice: "Renamed." };
}
