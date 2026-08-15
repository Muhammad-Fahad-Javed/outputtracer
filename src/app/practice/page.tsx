import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Practice — OutputTracer",
  description: "C++ output prediction practice questions, coming soon to OutputTracer.",
};

export default function PracticePage() {
  return (
    <>
      <Header />
      <main>
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#666666]">
            Coming Soon
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            Practice C++ Output Prediction
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-[#666666] sm:text-base">
            A dedicated set of output-prediction and dry-run practice questions is on
            the way — organized by topic, with instant feedback so you can test your
            reasoning before checking the predictor.
          </p>

          <div className="mt-10 rounded-md border border-dashed border-[#DCDCDC] px-6 py-10 text-center">
            <p className="font-mono text-sm text-[#999999]">Practice questions will appear here.</p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
