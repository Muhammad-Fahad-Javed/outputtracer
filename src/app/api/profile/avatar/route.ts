import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateUserProfile } from "@/lib/classroom/profileService";

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
    return NextResponse.json({ success: false, error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No image file provided." }, { status: 400 });
    }

    // Validate size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "Image file must be under 2MB." }, { status: 400 });
    }

    // Validate mime type
    const validMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validMimes.includes(file.type)) {
      return NextResponse.json({
        success: false,
        error: "Invalid file format. Only JPEG, PNG, WebP, and GIF are supported.",
      }, { status: 400 });
    }

    const admin = createAdminClient();
    let avatarUrl: string | null = null;

    if (admin) {
      const ext = file.name.split(".").pop() || "png";
      const filePath = `${user.id}/avatar-${Date.now()}.${ext}`;
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const { error: uploadError } = await admin.storage
        .from("avatars")
        .upload(filePath, buffer, {
          contentType: file.type,
          upsert: true,
        });

      if (!uploadError) {
        const { data: publicUrlData } = admin.storage.from("avatars").getPublicUrl(filePath);
        avatarUrl = publicUrlData.publicUrl;
      }
    }

    // If Supabase storage is unconfigured (local offline dev), convert to data URL fallback
    if (!avatarUrl) {
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      avatarUrl = `data:${file.type};base64,${base64}`;
    }

    const updateRes = await updateUserProfile(user.id, { avatarUrl });
    if (!updateRes.success) {
      return NextResponse.json({ success: false, error: updateRes.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      avatarUrl,
      message: "Avatar uploaded successfully.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to upload avatar";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE() {
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

  const updateRes = await updateUserProfile(user.id, { avatarUrl: null });
  if (!updateRes.success) {
    return NextResponse.json({ success: false, error: updateRes.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: "Avatar removed successfully.",
  });
}
