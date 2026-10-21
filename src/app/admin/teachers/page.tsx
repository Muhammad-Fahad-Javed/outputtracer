import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import { checkIsAdmin } from "@/lib/learn/db";
import { ShieldAlert, Lock, ArrowLeft } from "lucide-react";
import AdminTeacherManager from "@/components/admin/AdminTeacherManager";

export const metadata: Metadata = {
  title: "Admin Teacher Verification Center | OutputTracer",
  description: "Review, verify, and moderate educator classroom permissions.",
};

export default async function AdminTeachersPage() {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data?.user : null;

  // Strict Server-Side Admin Check
  const isAdmin = user ? await checkIsAdmin(user.id) : false;

  if (!user || !isAdmin) {
    return (
      <div className="flex min-h-screen flex-col bg-[#FAFAFA]">
        <Header />
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-[#EAEAEA] bg-white p-8 text-center shadow-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600 mb-4">
              <ShieldAlert size={28} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-black">
              Access Restricted
            </h1>
            <p className="mt-2 text-xs text-[#666666] leading-relaxed">
              Administrative credentials are required to review teacher applications and manage educator verification.
            </p>

            <div className="mt-6 flex flex-col gap-2">
              <Link
                href="/login?next=/admin/teachers"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-[4px] bg-black px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#333333]"
              >
                <Lock size={13} /> Sign in as Administrator
              </Link>
              <Link
                href="/"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-[4px] border border-[#DCDCDC] bg-white px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-[#F2F2F2]"
              >
                <ArrowLeft size={13} /> Return to Home
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA]">
      <Header />
      <main className="flex-1 py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <Link
                href="/admin/learn"
                className="inline-flex items-center gap-1.5 text-xs text-[#666666] hover:text-black mb-2"
              >
                <ArrowLeft size={13} /> Back to Learn CMS
              </Link>
              <h1 className="text-xl font-bold text-black tracking-tight">
                Teacher Verification & Educator Roster
              </h1>
              <p className="text-xs text-[#666666]">
                Review credentials, confirm institutional affiliations, and manage teacher classroom privileges.
              </p>
            </div>
          </div>

          <AdminTeacherManager />
        </div>
      </main>
      <Footer />
    </div>
  );
}
