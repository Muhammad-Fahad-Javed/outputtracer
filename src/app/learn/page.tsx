import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CourseCatalog from "@/components/learn/CourseCatalog";
import { getPublishedCourses } from "@/lib/learn/db";
import {
  Sparkles,
  ArrowRight,
  Cpu,
  Layers,
  CheckCircle2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "OutputTracer Learn — Visual Computer Science & Execution Tracing",
  description:
    "Master C++ and 8086 NASM Assembly through step-by-step memory, register, and output tracing. Comprehensive courses with hands-on practice questions.",
  alternates: {
    canonical: "/learn",
  },
  openGraph: {
    title: "OutputTracer Learn — Visual Computer Science & Execution Tracing",
    description:
      "Understand how software executes at the hardware and memory level. Interactive courses for C++ and 8086 Assembly with live tracing.",
    siteName: "OutputTracer",
    type: "website",
    url: "https://outputtracer.com/learn",
    images: [
      {
        url: "/brand/logo-tile.svg",
        width: 512,
        height: 512,
        alt: "OutputTracer Learn courses",
      },
    ],
  },
};

export default async function LearnPage() {
  const courses = await getPublishedCourses();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="border-b border-[#F0F0F0] bg-gradient-to-b from-[#FAFAFA] to-white py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#DCDCDC] bg-white px-3 py-1 text-xs font-semibold text-[#555555] shadow-xs">
                <Sparkles size={13} className="text-[#007ACC]" />
                Interactive Programming Education
              </div>

              <h1 className="mt-5 text-3xl font-bold tracking-tight text-black sm:text-5xl">
                Master C++ and 8086 Assembly through execution tracing.
              </h1>

              <p className="mt-5 text-base sm:text-lg text-[#555555] leading-relaxed">
                Move beyond guessing. Learn how CPU registers, flags, memory segments, and call
                stacks evolve line by line with visual dry runs and instant-feedback practice
                challenges.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/learn/dashboard"
                  className="inline-flex items-center gap-2 rounded-[4px] bg-black px-5 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-[#333333]"
                >
                  Go to Student Dashboard
                  <ArrowRight size={15} />
                </Link>

                <a
                  href="#courses"
                  className="inline-flex items-center gap-2 rounded-[4px] border border-[#DCDCDC] bg-white px-5 py-2.5 text-xs sm:text-sm font-semibold text-black transition-colors hover:bg-[#F5F5F5]"
                >
                  Browse Courses
                </a>
              </div>
            </div>

            {/* Quick Feature Highlights */}
            <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-[#EAEAEA] bg-white p-5 shadow-xs">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F0F4F8] text-[#005fb8]">
                  <Layers size={18} />
                </div>
                <h4 className="mt-3 text-sm font-semibold text-black">C++ Memory Models</h4>
                <p className="mt-1 text-xs text-[#666666] leading-relaxed">
                  Track variable scopes, loop counters, pointers, and recursive frames step-by-step.
                </p>
              </div>

              <div className="rounded-xl border border-[#EAEAEA] bg-white p-5 shadow-xs">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EDF6FD] text-[#007ACC]">
                  <Cpu size={18} />
                </div>
                <h4 className="mt-3 text-sm font-semibold text-black">8086 Hardware State</h4>
                <p className="mt-1 text-xs text-[#666666] leading-relaxed">
                  Inspect AX-DX, SP, BP, SI, DI, segment registers, CPU flags, and DOS INT 21h outputs.
                </p>
              </div>

              <div className="rounded-xl border border-[#EAEAEA] bg-white p-5 shadow-xs">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F2FBF5] text-emerald-700">
                  <CheckCircle2 size={18} />
                </div>
                <h4 className="mt-3 text-sm font-semibold text-black">Instant Verification</h4>
                <p className="mt-1 text-xs text-[#666666] leading-relaxed">
                  Predict outputs and answer architectural quiz questions graded directly by the server.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Course Catalog Section */}
        <section id="courses" className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-black sm:text-3xl">
                Featured Courses
              </h2>
              <p className="mt-2 text-sm text-[#666666]">
                Structured curricula designed for practical mastery, university exam prep, and systems comprehension.
              </p>
            </div>

            <Link
              href="/learn/dashboard"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#007ACC] hover:underline"
            >
              View My Learning Progress &rarr;
            </Link>
          </div>

          <CourseCatalog initialCourses={courses} />
        </section>

        {/* How It Works Section */}
        <section className="border-t border-[#F0F0F0] bg-[#FAFAFA] py-16">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <h2 className="text-xl font-bold tracking-tight text-black sm:text-2xl text-center">
              A Direct Connection to Interactive Labs
            </h2>
            <p className="mt-2 text-center text-sm text-[#666666] max-w-xl mx-auto">
              Every lesson includes code snippets you can open directly in the C++ Predictor or 8086 Assembly Lab with a single click.
            </p>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-[#EAEAEA] bg-white p-6 shadow-xs">
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#005fb8]">
                  C++ Predictor Integration
                </span>
                <h3 className="mt-2 text-base font-semibold text-black">
                  Trace Variables & Dry-Run Timelines
                </h3>
                <p className="mt-2 text-xs text-[#666666] leading-relaxed">
                  When reading a lesson on loops, arrays, or pointers, click <strong>Trace in C++ Predictor</strong> to immediately launch the code in our live engine and inspect memory mutations.
                </p>
                <div className="mt-4">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#005fb8] hover:underline"
                  >
                    Open C++ Predictor &rarr;
                  </Link>
                </div>
              </div>

              <div className="rounded-xl border border-[#EAEAEA] bg-white p-6 shadow-xs">
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#007ACC]">
                  8086 Assembly Lab Integration
                </span>
                <h3 className="mt-2 text-base font-semibold text-black">
                  Step Instructions & Watch Registers
                </h3>
                <p className="mt-2 text-xs text-[#666666] leading-relaxed">
                  When studying 16-bit real mode, click <strong>Inspect in 8086 Assembly Lab</strong> to load your NASM source, step through clock cycles, and inspect CPU flags and DOS memory.
                </p>
                <div className="mt-4">
                  <Link
                    href="/assembly"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#007ACC] hover:underline"
                  >
                    Open 8086 Assembly Lab &rarr;
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
