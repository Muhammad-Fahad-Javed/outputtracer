import type { Metadata } from "next";
import HomeIdeShell from "@/components/HomeIdeShell";

// This is the C++ compiler page (`/`). `openGraph` and `twitter` are
// intentionally left to the root layout, whose values already describe this
// page (title, description, url, image).
export const metadata: Metadata = {
  title: "Online C++ Compiler | OutputTracer",
  description:
    "Write and run C++ code online with OutputTracer. Trace execution step by step, inspect variables, debug programs, and practice C++ in your browser.",
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  return (
    <main className="h-screen w-full bg-[#0A0A0A] overflow-hidden">
      {/* Single, screen-reader-available primary heading. The IDE itself is
          client-rendered (ssr:false), so without this the page had no <h1>. */}
      <h1 className="sr-only">Online C++ Compiler</h1>
      {/* Unified Multi-Language Code Tracing IDE (C++, Python 3, Assembly NASM) */}
      <HomeIdeShell />
    </main>
  );
}
