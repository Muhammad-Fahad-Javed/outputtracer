"use client";

import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { examples, setPendingExample } from "@/lib/examples";

const CATEGORIES = Array.from(new Set(examples.map((e) => e.category)));

export default function ExamplesPage() {
  const router = useRouter();

  const handleTry = (code: string) => {
    setPendingExample(code);
    router.push("/#predictor");
  };

  return (
    <>
      <Header />
      <main>
        <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Example Programs
          </h1>
          <p className="mt-2 max-w-lg text-sm text-[#666666] sm:text-base">
            Browse sample C++ programs by topic. Pick one to load it straight into the predictor.
          </p>

          <div className="mt-10 flex flex-col gap-12">
            {CATEGORIES.map((category) => (
              <div key={category}>
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#666666]">
                  {category}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {examples
                    .filter((e) => e.category === category)
                    .map((example) => (
                      <div
                        key={example.id}
                        className="flex flex-col rounded-md border border-[#DCDCDC] p-4"
                      >
                        <h3 className="mb-3 text-sm font-semibold">{example.title}</h3>
                        <pre className="mono-scroll overflow-x-auto rounded-sm bg-[#111111] p-3 font-mono text-[12px] leading-relaxed text-[#DCDCDC]">
                          {example.code}
                        </pre>
                        <div className="mt-3 flex items-center justify-between">
                          <p className="text-xs text-[#666666]">
                            Expected:{" "}
                            <span className="font-mono text-black">{example.expectedOutput}</span>
                          </p>
                          <button
                            type="button"
                            onClick={() => handleTry(example.code)}
                            className="text-xs font-medium text-black underline decoration-[#DCDCDC] decoration-2 underline-offset-4 transition-colors hover:decoration-black"
                          >
                            Try in Predictor →
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
