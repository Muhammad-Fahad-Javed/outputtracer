import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AdminLearnManager from "@/components/admin/AdminLearnManager";
import { createClient } from "@/lib/supabase/server";
import {
  checkIsAdmin,
  getAdminAnalyticsSummary,
  getAllCoursesAdmin,
  getAllLessonsAdmin,
  getAllQuestionsAdmin,
} from "@/lib/learn/db";
import { ShieldAlert, ShieldCheck, Lock, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Admin Curriculum & Course Management | OutputTracer",
  description: "Administrative interface for OutputTracer Learn courses, lessons, and practice questions.",
};

export default async function AdminLearnPage() {
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
              Administrative credentials are required to access OutputTracer Learn Content Management. Ordinary students and guests cannot access this interface.
            </p>

            <div className="mt-6 flex flex-col gap-2">
              <Link
                href="/login?next=/admin/learn"
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

  // Fetch admin content data
  const [analytics, courses, lessons, questions] = await Promise.all([
    getAdminAnalyticsSummary(),
    getAllCoursesAdmin(),
    getAllLessonsAdmin(),
    getAllQuestionsAdmin(),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      <main className="flex-1 pb-20">
        {/* Admin Header Banner */}
        <section className="border-b border-[#F0F0F0] bg-[#FAFAFA] py-8 sm:py-10">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                  <ShieldCheck size={13} />
                  Verified Administrator Session
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-black sm:text-3xl">
                  OutputTracer Learn Administration
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-[#666666]">
                  Manage published courses, syllabus modules, lessons, and practice question answer keys.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/learn"
                  className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#DCDCDC] bg-white px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-[#F2F2F2]"
                >
                  View Public Catalog &rarr;
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Admin Management Interface */}
        <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
          <AdminLearnManager
            initialAnalytics={analytics}
            initialCourses={courses}
            initialLessons={lessons}
            initialQuestions={questions}
          />
        </section>
      </main>

      <Footer />
    </div>
  );
}
