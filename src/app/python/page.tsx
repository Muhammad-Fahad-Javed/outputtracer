import type { Metadata } from "next";
import PythonLab from "@/components/python/PythonLab";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Python 3 Trace & Execution Lab | OutputTracer",
  description:
    "Interactive Python 3 step-by-step execution tracer. Inspect local variables, call stacks, return values, standard input, and program output with deterministic timeline stepping.",
};

export default function PythonPage() {
  return (
    <main className="flex h-screen w-full flex-col overflow-hidden bg-[#1E1E1E]">
      <Header />
      <div className="flex-1 overflow-hidden">
        <PythonLab />
      </div>
    </main>
  );
}
