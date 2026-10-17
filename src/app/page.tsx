"use client";

import UnifiedShell from "@/components/UnifiedShell";

export default function Home() {
  return (
    <main className="h-screen w-full bg-[#0A0A0A] overflow-hidden">
      {/* Unified Multi-Language Code Tracing IDE (C++, Python 3, Assembly NASM) */}
      <UnifiedShell />
    </main>
  );
}
