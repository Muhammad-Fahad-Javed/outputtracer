import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "About | OutputTracer",
  description: "Learn what OutputTracer is, and how it helps students and developers write and run C++ code online.",
};

export default function AboutPage() {
  return (
    <>
      <Header />
      <main>
        <section className="mx-auto max-w-2xl px-5 py-20 sm:px-8 sm:py-28">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            About OutputTracer
          </h1>

          <div className="mt-6 flex flex-col gap-5 text-[15px] leading-relaxed text-[#666666]">
            <p>
              OutputTracer is a focused tool for one job: predicting what a C++ program
              will print, and showing exactly how it gets there. Paste in code, and
              you&apos;ll see the expected output alongside a step-by-step trace of how
              variables change along the way.
            </p>
            <p>
              It&apos;s built for students and self-learners practicing output prediction
              and dry-run questions — a skill that matters in coursework, exams, and
              everyday debugging, but that&apos;s easy to skip when you can just run the
              code and see what happens.
            </p>
            <p>
              This is the first version of OutputTracer. Predictions and dry runs
              currently use representative example logic rather than a full C++
              execution engine, which is planned for a future release.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
