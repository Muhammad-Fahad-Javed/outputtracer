"use client";

import dynamic from "next/dynamic";

// The IDE shell is browser-only (Monaco, xterm, WebSocket terminal), so it is
// loaded with SSR disabled. Keeping it in a small client component lets
// `src/app/page.tsx` stay a Server Component and export page metadata
// (title, description, self-referencing canonical).
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

export default function HomeIdeShell() {
  return <UnifiedShell />;
}
