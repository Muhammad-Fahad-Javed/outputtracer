import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  listClassroomGroups,
  createClassroomGroup,
  assignStudentToGroup,
} from "@/lib/classroom/classroomService";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  let user = null;
  try {
    const supabase = await createServerClient();
    if (supabase) {
      user = (await supabase.auth.getUser()).data.user;
    }
  } catch {
    // Unauthenticated
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  const { classId } = await params;
  const result = await listClassroomGroups(user.id, classId);

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Access denied" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    groups: result.groups,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  let user = null;
  try {
    const supabase = await createServerClient();
    if (supabase) {
      user = (await supabase.auth.getUser()).data.user;
    }
  } catch {
    // Unauthenticated
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  const { classId } = await params;

  let body: { name: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const result = await createClassroomGroup(user.id, classId, body.name);
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed creating group" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    group: result.group,
    message: "Group created successfully.",
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  let user = null;
  try {
    const supabase = await createServerClient();
    if (supabase) {
      user = (await supabase.auth.getUser()).data.user;
    }
  } catch {
    // Unauthenticated
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  const { classId } = await params;

  let body: { groupId: string; studentUserId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  if (!body.groupId || !body.studentUserId) {
    return NextResponse.json({ error: "Missing groupId or studentUserId" }, { status: 400 });
  }

  const result = await assignStudentToGroup(user.id, classId, body.groupId, body.studentUserId);
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed assigning student to group" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    message: "Student assigned to group successfully.",
  });
}
