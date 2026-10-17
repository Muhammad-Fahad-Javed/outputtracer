"use client";

import UnifiedShell from "@/components/UnifiedShell";
import SeoContent from "@/components/SeoContent";

export default function Home() {
  return (
    <main className="min-h-screen w-full bg-[#1E1E1E] flex flex-col">
      {/* Unified Multi-Language Code Tracing IDE (C++, Python 3, Assembly NASM) */}
      <div className="h-screen w-full flex flex-col overflow-hidden">
        <UnifiedShell />
      </div>
      {/* Educational & Architectural Overview */}
      <SeoContent />
    </main>
  );
}
