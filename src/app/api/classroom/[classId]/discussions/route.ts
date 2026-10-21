/**
 * GET /api/classroom/[classId]/discussions?assignmentId=...&groupId=...
 *   Lists discussion threads.
 *   - Assignment discussions: visible to enrolled students.
 *   - Group discussions: visible ONLY to members of that specific group or the teacher.
 *
 * POST /api/classroom/[classId]/discussions
 *   Creates a discussion post / reply.
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createDiscussionPost, listDiscussionPosts } from "@/lib/classroom/communicationService";
import type { CreateDiscussionPostInput } from "@/lib/classroom/communicationTypes";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  const { classId } = await params;
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const assignmentId = url.searchParams.get("assignmentId") ?? undefined;
  const groupId = url.searchParams.get("groupId") ?? undefined;

  const result = await listDiscussionPosts(classId, user.id, assignmentId, groupId);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });
  }

  return NextResponse.json({ success: true, posts: result.posts });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  const { classId } = await params;
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  let body: CreateDiscussionPostInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.content || typeof body.content !== "string" || body.content.trim().length === 0) {
    return NextResponse.json({ success: false, error: "Post content cannot be empty." }, { status: 400 });
  }

  const result = await createDiscussionPost(classId, user.id, body);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });
  }

  return NextResponse.json({ success: true, post: result.post });
}
