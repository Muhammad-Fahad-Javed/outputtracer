import type { Metadata } from "next";
import AssemblyLab from "@/components/asm/AssemblyLab";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Online 8086 Assembly Emulator | OutputTracer",
  description:
    "Practice 8086 assembly online with OutputTracer's assembly lab and execution tools. Assemble DOS programs and inspect registers, flags, memory, and the stack step by step.",
  alternates: {
    canonical: "/assembly",
  },
  openGraph: {
    title: "Online 8086 Assembly Emulator | OutputTracer",
    description:
      "Practice 8086 assembly online and inspect registers, flags, memory, and the stack step by step.",
    siteName: "OutputTracer",
    type: "website",
    url: "https://outputtracer.com/assembly",
    images: [
      {
        url: "/brand/logo-tile.svg",
        width: 512,
        height: 512,
        alt: "OutputTracer 8086 Assembly Lab logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Online 8086 Assembly Emulator | OutputTracer",
    description:
      "Practice 8086 assembly online and inspect registers, flags, memory, and the stack step by step.",
    images: ["/brand/logo-tile.svg"],
  },
};

export default function AssemblyPage() {
  return (
    <main className="flex h-screen w-full flex-col overflow-hidden bg-[#1E1E1E]">
      {/* Single primary heading; the lab UI is client-rendered. */}
      <h1 className="sr-only">Online 8086 Assembly Emulator</h1>
      <Header />
      <div className="flex-1 overflow-hidden">
        <AssemblyLab />
      </div>
    </main>
  );
}
