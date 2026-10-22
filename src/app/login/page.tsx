import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import AuthForm from "@/components/auth/AuthForm";
import SetupRequired from "@/components/cloud/SetupRequired";
import { safeNextPath } from "@/lib/cloud/roles";
import { isAuthConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getUserCapabilities } from "@/lib/classroom/roles";
import { parseSessionRole, SESSION_ROLE_COOKIE } from "@/lib/sessionRole";
import { BookOpen, GraduationCap, ShieldCheck, ArrowRight, ShieldAlert, ArrowLeft } from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; role?: string }>;
}) {
  const params = await searchParams;
  if (!isAuthConfigured()) return <SetupRequired />;

  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const role = params.role as "learner" | "teacher" | "admin" | undefined;

  // Resolve user capabilities if authenticated
  let capabilities = null;
  if (user) {
    capabilities = await getUserCapabilities(user.id);
  }

  // 1. If user is authenticated and visited /login without a role or with an existing session:
  if (user && capabilities) {
    if (role === "admin") {
      if (capabilities.isAdmin) {
        const next = params.next ? `&next=${encodeURIComponent(params.next)}` : "";
        redirect(`/auth/continue?role=admin${next}`);
      }
      // Authenticated but NOT admin -> Show Access Restricted state
      return (
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
          <Link href="/" className="text-[14px] font-semibold text-black">
            OutputTracer
          </Link>
          <div className="mt-8 rounded-2xl border border-rose-200 bg-white p-6 shadow-xs text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 mb-4">
              <ShieldAlert size={24} />
            </div>
            <h1 className="text-lg font-bold text-black tracking-tight">
              Administrator Access Restricted
            </h1>
            <p className="mt-2 text-xs text-[#666666] leading-relaxed">
              Your account (<strong>{user.email}</strong>) does not have platform administrator credentials.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Link
                href="/classroom/student"
                className="w-full rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-[#333333] text-center"
              >
                Go to Learner Dashboard
              </Link>
              <Link
                href="/login"
                className="w-full rounded-[4px] border border-[#DCDCDC] px-4 py-2 text-xs font-medium text-black hover:bg-[#F2F2F2] text-center"
              >
                Choose Another Role
              </Link>
            </div>
          </div>
        </main>
      );
    }

    if (role === "teacher" || role === "learner") {
      const next = params.next ? `&next=${encodeURIComponent(params.next)}` : "";
      redirect(`/auth/continue?role=${role}${next}`);
    }

    // No role on this visit: keep the role they already chose. An approved
    // teacher profile does not take over a learner session. Admins with no
    // saved role still open the admin home.
    const cookieStore = await cookies();
    const saved = parseSessionRole(cookieStore.get(SESSION_ROLE_COOKIE)?.value);
    const chosen = saved ?? (capabilities.isAdmin ? "admin" : "learner");
    const next = params.next ? `&next=${encodeURIComponent(params.next)}` : "";
    redirect(`/auth/continue?role=${chosen}${next}`);
  }

  // 2. If a specific role was selected, show the role-specific sign-in form
  if (role && (role === "learner" || role === "teacher" || role === "admin")) {
    const defaultNext =
      role === "admin"
        ? "/admin"
        : role === "teacher"
        ? "/classroom/teacher"
        : "/classroom/student";

    const nextPath = params.next ? safeNextPath(params.next) : defaultNext;

    return (
      <AuthForm
        mode="login"
        role={role}
        nextPath={nextPath}
        initialError={params.error ?? null}
      />
    );
  }

  // 3. Role Selection Screen (When visitor clicks Login or Get Started)
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-5 py-16">
      <div className="text-center max-w-xl mx-auto mb-10">
        <Link href="/" className="inline-block text-[15px] font-semibold tracking-tight text-black mb-3">
          OutputTracer
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-black">
          Choose your role to continue
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-[#666666]">
          Select how you want to use OutputTracer. All roles share one secure account identity.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Role 1: Learner / Student */}
        <div className="flex flex-col justify-between rounded-xl border border-[#EAEAEA] bg-white p-6 shadow-xs hover:border-[#007ACC] transition-all group">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600 mb-4 group-hover:scale-105 transition-transform">
              <BookOpen size={22} />
            </div>
            <h2 className="text-base font-bold text-black tracking-tight">
              Learner / Student
            </h2>
            <p className="mt-2 text-xs text-[#666666] leading-relaxed">
              Learn programming, join classrooms, track progress, complete assignments, and build projects.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-[#F2F2F2]">
            <Link
              href="/login/learner"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-[4px] bg-black px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#333333]"
            >
              Continue as Learner <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {/* Role 2: Teacher / Educator */}
        <div className="flex flex-col justify-between rounded-xl border border-[#EAEAEA] bg-white p-6 shadow-xs hover:border-[#007ACC] transition-all group">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 mb-4 group-hover:scale-105 transition-transform">
              <GraduationCap size={22} />
            </div>
            <h2 className="text-base font-bold text-black tracking-tight">
              Teacher / Educator
            </h2>
            <p className="mt-2 text-xs text-[#666666] leading-relaxed">
              Teach students, manage classrooms, create assignments, and review submissions.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-[#F2F2F2]">
            <Link
              href="/login/teacher"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-[4px] bg-black px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#333333]"
            >
              Continue as Teacher <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {/* Role 3: Administrator */}
        <div className="flex flex-col justify-between rounded-xl border border-[#EAEAEA] bg-white p-6 shadow-xs hover:border-[#007ACC] transition-all group">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-amber-50 text-amber-700 mb-4 group-hover:scale-105 transition-transform">
              <ShieldCheck size={22} />
            </div>
            <h2 className="text-base font-bold text-black tracking-tight">
              Administrator
            </h2>
            <p className="mt-2 text-xs text-[#666666] leading-relaxed">
              Manage users, verify educators, administer courses, and oversee the platform.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-[#F2F2F2]">
            <Link
              href="/login/admin"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-[4px] bg-black px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#333333]"
            >
              Continue as Administrator <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-[#888888] hover:text-black transition-colors"
        >
          <ArrowLeft size={12} /> Return to Home
        </Link>
      </div>
    </main>
  );
}
