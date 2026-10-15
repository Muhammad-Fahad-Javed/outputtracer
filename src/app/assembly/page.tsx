import type { Metadata } from "next";
import AssemblyLab from "@/components/asm/AssemblyLab";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "8086 NASM Assembly Lab | OutputTracer",
  description:
    "Interactive 8086 / DOS 16-bit NASM assembly tracer. Step-by-step instruction execution with real registers, flags, memory, stack, and DOS INT 21h inspection.",
};

export default function AssemblyPage() {
  return (
    <main className="flex h-screen w-full flex-col overflow-hidden bg-[#1E1E1E]">
      <Header />
      <div className="flex-1 overflow-hidden">
        <AssemblyLab />
      </div>
    </main>
  );
}
