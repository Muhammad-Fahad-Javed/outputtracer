"use client";

import dynamic from "next/dynamic";

const UnifiedShell = dynamic(() => import("@/components/UnifiedShell"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-[#0A0A0A] text-[#CCCCCC]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#333333] border-t-white" />
        <span className="font-mono text-xs text-[#858585]">Loading OutputTracer IDE…</span>
      </div>
    </div>
  ),
});

export default function Home() {
  return (
    <main className="h-screen w-full bg-[#0A0A0A] overflow-hidden">
      {/* Unified Multi-Language Code Tracing IDE (C++, Python 3, Assembly NASM) */}
      <UnifiedShell />
    </main>
  );
}
