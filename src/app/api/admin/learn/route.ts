import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  checkIsAdmin,
  adminUpsertCourse,
  adminDeleteCourse,
  adminUpsertLesson,
  adminDeleteLesson,
  adminUpsertQuestion,
  adminDeleteQuestion,
  getAdminAnalyticsSummary,
} from "@/lib/learn/db";

// Helper to strictly require admin
async function requireAdminUser() {
  const supabase = await createServerClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const isAdmin = await checkIsAdmin(user.id);
  if (!isAdmin) return null;
  return user;
}

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized. Admin privileges required." }, { status: 403 });
  }

  const analytics = await getAdminAnalyticsSummary();
  return NextResponse.json({ success: true, analytics });
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized. Admin privileges required." }, { status: 403 });
  }

  let body: {
    target: "course" | "lesson" | "question";
    action: "upsert" | "delete";
    data?: Record<string, unknown>;
    id?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const { target, action, data, id } = body;

  try {
    if (target === "course") {
      if (action === "upsert") {
        const langId = data?.language_id || data?.languageId;
        if (!data || !data.id || !data.title || !langId) {
          return NextResponse.json({ error: "Invalid course data (id, title, language_id required)" }, { status: 400 });
        }
        const updated = await adminUpsertCourse(data);
        return NextResponse.json({ success: true, course: updated });
      } else if (action === "delete") {
        if (!id) return NextResponse.json({ error: "Missing course id" }, { status: 400 });
        await adminDeleteCourse(id);
        return NextResponse.json({ success: true, message: `Course ${id} deleted` });
      }
    }

    if (target === "lesson") {
      if (action === "upsert") {
        if (!data || !data.id || !data.module_id || !data.course_id || !data.title) {
          return NextResponse.json({ error: "Invalid lesson data" }, { status: 400 });
        }
        const updated = await adminUpsertLesson(data);
        return NextResponse.json({ success: true, lesson: updated });
      } else if (action === "delete") {
        if (!id) return NextResponse.json({ error: "Missing lesson id" }, { status: 400 });
        await adminDeleteLesson(id);
        return NextResponse.json({ success: true, message: `Lesson ${id} deleted` });
      }
    }

    if (target === "question") {
      if (action === "upsert") {
        if (!data || !data.id || !data.course_id || !data.title || !data.answer) {
          return NextResponse.json({ error: "Invalid question data" }, { status: 400 });
        }
        const updated = await adminUpsertQuestion(data);
        return NextResponse.json({ success: true, question: updated });
      } else if (action === "delete") {
        if (!id) return NextResponse.json({ error: "Missing question id" }, { status: 400 });
        await adminDeleteQuestion(id);
        return NextResponse.json({ success: true, message: `Question ${id} deleted` });
      }
    }

    return NextResponse.json({ error: `Unknown target or action: ${target} / ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message || "Admin operation failed" }, { status: 500 });
  }
}
