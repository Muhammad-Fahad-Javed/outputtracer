/**
 * GET /api/classroom/[classId]/announcements
 *   List classroom announcements (enrolled students + teachers).
 *
 * POST /api/classroom/[classId]/announcements
 *   Create a new announcement (instructor only).
 */

import { NextResponse } from "next/server";
import { createAnnouncement, listAnnouncements } from "@/lib/classroom/communicationService";
import type { CreateAnnouncementInput } from "@/lib/classroom/communicationTypes";
import { classroomRequestUser } from "@/lib/classroom/requestUser";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  const { classId } = await params;
  const user = await classroomRequestUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  const result = await listAnnouncements(classId, user.id);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });
  }

  return NextResponse.json({ success: true, announcements: result.announcements });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  const { classId } = await params;
  const user = await classroomRequestUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  let body: CreateAnnouncementInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.title || typeof body.title !== "string" || body.title.trim().length === 0) {
    return NextResponse.json({ success: false, error: "Announcement title is required." }, { status: 400 });
  }
  if (!body.content || typeof body.content !== "string" || body.content.trim().length === 0) {
    return NextResponse.json({ success: false, error: "Announcement content is required." }, { status: 400 });
  }

  const result = await createAnnouncement(classId, user.id, body);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });
  }

  return NextResponse.json({ success: true, announcement: result.announcement });
}
