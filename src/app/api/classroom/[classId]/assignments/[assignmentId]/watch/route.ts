import { NextResponse } from "next/server";
import { getHub } from "@/lib/cloud/collabHub";
import { assignmentFreezeState } from "@/lib/classroom/assignmentPolicy";
import { classroomDocumentKey } from "@/lib/classroom/documents";
import { classroomRequestUser } from "@/lib/classroom/requestUser";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAssignment,
  listClassroomGroups,
  listClassroomRoster,
} from "@/lib/classroom/classroomService";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const user = await classroomRequestUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  const { classId, assignmentId } = await params;
  const loaded = await getAssignment(user.id, classId, assignmentId);
  if (!loaded.success || !loaded.isTeacher || !loaded.assignment) {
    return NextResponse.json({ success: false, error: "Instructor access to this assignment is required." }, { status: 403 });
  }
  const assignment = loaded.assignment;
  const freeze = assignmentFreezeState(assignment);
  type Participant = {
    kind: "group" | "student";
    id: string;
    name: string;
    docKey: string;
    members?: { userId: string; displayName: string }[];
    online: { userId: string; name: string; file: string | null }[];
  };
  const participants: Participant[] = [];
  const hub = getHub();
  const admin = createAdminClient();
  if (admin && assignment.groupMode) {
    const scope = assignment.groupScope === "assignment" ? assignmentId : null;
    const { data, error } = await admin.from("classroom_groups")
      .select("id, name, members:classroom_group_members!classroom_group_members_group_id_fkey(user_id, profile:profiles!classroom_group_members_user_id_fkey(display_name))")
      .eq("classroom_id", classId)
      .filter("assignment_id", scope ? "eq" : "is", scope ?? "null")
      .order("created_at");
    if (error) return NextResponse.json({ success: false, error: "Could not load groups." }, { status: 503 });
    for (const group of data || []) {
      const docKey = classroomDocumentKey(assignmentId, { groupId: group.id })!;
      participants.push({
        kind: "group", id: group.id, name: group.name, docKey,
        members: group.members.map(member => {
          const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
          return { userId: member.user_id, displayName: profile?.display_name || member.user_id };
        }),
        online: hub.classroomPresence(docKey, false),
      });
    }
  } else if (admin) {
    const { data, error } = await admin.from("classroom_members")
      .select("user_id, profile:profiles!classroom_members_user_id_fkey(display_name)")
      .eq("classroom_id", classId).eq("role", "student").order("joined_at");
    if (error) return NextResponse.json({ success: false, error: "Could not load students." }, { status: 503 });
    for (const student of data || []) {
      const docKey = classroomDocumentKey(assignmentId, { studentId: student.user_id })!;
      const profile = Array.isArray(student.profile) ? student.profile[0] : student.profile;
      participants.push({ kind: "student", id: student.user_id, name: profile?.display_name || student.user_id, docKey, online: hub.classroomPresence(docKey, false) });
    }

  } else if (assignment.groupMode) {
    const groups = await listClassroomGroups(user.id, classId, assignmentId);
    if (!groups.success) {
      return NextResponse.json({ success: false, error: groups.error || "Could not load groups" }, { status: 403 });
    }
    for (const group of groups.groups || []) {
      const docKey = classroomDocumentKey(assignmentId, { groupId: group.id });
      if (!docKey) continue;
      participants.push({
        kind: "group",
        id: group.id,
        name: group.name,
        docKey,
        members: (group.members || []).map((member) => ({
          userId: member.userId,
          displayName: member.displayName || member.userId,
        })),
        online: hub.classroomPresence(docKey, false),
      });
    }
  } else {
    const roster = await listClassroomRoster(user.id, classId);
    if (!roster.success) return NextResponse.json({ success: false, error: "Could not load students." }, { status: 503 });
    for (const member of roster.members || []) {
      if (member.role !== "student") continue;
      const docKey = classroomDocumentKey(assignmentId, { studentId: member.userId });
      if (!docKey) continue;
      participants.push({
        kind: "student",
        id: member.userId,
        name: member.displayName || member.userId,
        docKey,
        online: hub.classroomPresence(docKey, false),
      });
    }
  }

  return NextResponse.json({
    success: true,
    groupMode: assignment.groupMode,
    frozen: freeze.frozen,
    freezeReason: freeze.reason ?? null,
    locked: assignment.locked,
    allowLate: assignment.allowLate,
    allowRun: assignment.allowRun,
    allowTrace: assignment.allowTrace,
    timeLimitMs: assignment.timeLimitMs,
    participants,
  });
}
