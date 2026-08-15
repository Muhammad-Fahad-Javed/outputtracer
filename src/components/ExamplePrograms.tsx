"use client";

import { examples } from "@/lib/examples";

const FEATURED = ["basic-arithmetic", "if-else", "for-loop", "array-sum", "recursion-factorial", "class-object"];

interface ExampleProgramsProps {
  onSelect: (code: string) => void;
}

export default function ExamplePrograms({ onSelect }: ExampleProgramsProps) {
  const featured = examples.filter((e) => FEATURED.includes(e.id));

  return (
    <section id="examples" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Practice With Examples
      </h2>
      <p className="mt-2 max-w-lg text-sm text-[#666666] sm:text-base">
        Pick a program below to load it directly into the predictor.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {featured.map((example) => (
          <button
            key={example.id}
            type="button"
            onClick={() => {
              onSelect(example.code);
              document.getElementById("tool")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="group flex flex-col rounded-md border border-[#E5E5E5] p-4 text-left transition-colors hover:border-black"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#666666]">
                {example.category}
              </span>
              <span className="text-xs text-[#999999] transition-colors group-hover:text-black">
                Load →
              </span>
            </div>
            <h3 className="mb-3 text-sm font-semibold">{example.title}</h3>
            <pre className="mono-scroll overflow-x-auto rounded-sm bg-[#111111] p-3 font-mono text-[12px] leading-relaxed text-[#E5E5E5]">
              {example.code}
            </pre>
            <p className="mt-3 text-xs text-[#666666]">
              Expected: <span className="font-mono text-black">{example.expectedOutput}</span>
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
