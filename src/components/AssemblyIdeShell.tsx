"use client";

import dynamic from "next/dynamic";

// Monaco and the program consoles require browser APIs. Keep the route itself
// server-rendered so its metadata and primary heading remain available.
const UnifiedShell = dynamic(() => import("@/components/UnifiedShell"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-[#0A0A0A] text-[#CCCCCC]">
      <div className="flex flex-col items-center gap-3" role="status">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#333333] border-t-white" aria-hidden="true" />
        <span className="font-mono text-xs text-[#858585]">Loading 8086 Assembly Lab…</span>
      </div>
    </div>
  ),
});

export default function AssemblyIdeShell() {
  return <UnifiedShell initialLanguage="assembly" assemblyLab />;
}
