import { NextResponse } from "next/server";
import { getHub } from "@/lib/cloud/collabHub";
import { assignmentFreezeState } from "@/lib/classroom/assignmentPolicy";
import { classroomDocumentKey } from "@/lib/classroom/documents";
import { classroomRequestUser } from "@/lib/classroom/requestUser";
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
  const participants: Array<{
    kind: "group" | "student";
    id: string;
    name: string;
    docKey: string;
    members?: { userId: string; displayName: string }[];
    online: { userId: string; name: string; file: string | null }[];
  }> = [];

  if (assignment.groupMode) {
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
        online: getHub().classroomPresence(docKey, false),
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
        online: getHub().classroomPresence(docKey, false),
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
