import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HowItWorks from "@/components/HowItWorks";
import WhyOutputTracer from "@/components/WhyOutputTracer";
import Topics from "@/components/Topics";
import FAQ from "@/components/FAQ";

export const metadata: Metadata = {
  title: "Learn C++ | OutputTracer",
  description:
    "Learn C++ programming online. Understand how OutputTracer predicts C++ output and traces execution, and which topics it covers.",
};

export default function LearnPage() {
  return (
    <>
      <Header />
      <main>
        <section className="mx-auto max-w-6xl px-5 pb-4 pt-14 sm:px-8 sm:pt-20">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Learn</h1>
          <p className="mt-2 max-w-lg text-sm text-[#666666] sm:text-base">
            How OutputTracer works, what it can trace, and answers to common questions.
          </p>
        </section>
        <HowItWorks />
        <WhyOutputTracer />
        <Topics />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
