import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  createClassroom,
  listUserClassrooms,
} from "@/lib/classroom/classroomService";
import { getUserCapabilities } from "@/lib/classroom/roles";
import { CreateClassroomInput } from "@/lib/classroom/types";

export async function GET() {
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

  const [classrooms, capabilities] = await Promise.all([
    listUserClassrooms(user.id),
    getUserCapabilities(user.id),
  ]);

  return NextResponse.json({
    success: true,
    teaching: classrooms.teaching,
    enrolled: classrooms.enrolled,
    capabilities,
  });
}

export async function POST(request: Request) {
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

  let body: CreateClassroomInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const result = await createClassroom(user.id, body);
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed creating classroom" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    classroom: result.classroom,
    message: "Classroom created successfully.",
  });
}
