import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  getUserProfile,
  updateUserProfile,
  deleteUserAccount,
  ProfileUpdateInput,
} from "@/lib/classroom/profileService";

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
    return NextResponse.json({ success: false, error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  const profile = await getUserProfile(user.id);
  if (!profile) {
    return NextResponse.json({ success: false, error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    profile,
  });
}

export async function PUT(request: Request) {
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
    return NextResponse.json({ success: false, error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  let body: ProfileUpdateInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON request body." }, { status: 400 });
  }

  const result = await updateUserProfile(user.id, body);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    profile: result.profile,
    message: "Profile updated successfully.",
  });
}

export async function DELETE(request: Request) {
  let user = null;
  let supabase = null;
  try {
    supabase = await createServerClient();
    if (supabase) {
      user = (await supabase.auth.getUser()).data.user;
    }
  } catch {
    // Unauthenticated
  }

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  let body: { confirmationPhrase: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON request body." }, { status: 400 });
  }

  const result = await deleteUserAccount(user.id, body.confirmationPhrase);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  // Sign out user session
  if (supabase) {
    await supabase.auth.signOut();
  }

  return NextResponse.json({
    success: true,
    message: "Your account and personal data have been permanently deleted.",
  });
}
