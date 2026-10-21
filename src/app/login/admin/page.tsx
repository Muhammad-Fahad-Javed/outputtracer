import { redirect } from "next/navigation";
import Link from "next/link";
import AuthForm from "@/components/auth/AuthForm";
import SetupRequired from "@/components/cloud/SetupRequired";
import { isAuthConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { checkIsAdmin } from "@/lib/learn/db";
import { ShieldAlert } from "lucide-react";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  if (!isAuthConfigured()) return <SetupRequired />;

  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  if (user) {
    const isAdmin = await checkIsAdmin(user.id);
    if (isAdmin) {
      const next = params.next ? `&next=${encodeURIComponent(params.next)}` : "";
      redirect(`/auth/continue?role=admin${next}`);
    }

    // Authenticated user lacks admin role
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
            Your authenticated account (<strong>{user.email}</strong>) does not have administrator privileges.
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
              Switch Role or Sign Out
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <AuthForm
      mode="login"
      role="admin"
      nextPath="/admin"
      initialError={params.error ?? null}
    />
  );
}
