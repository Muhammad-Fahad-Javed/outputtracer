"use client";

import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";
import ClothericWelcome from "@/components/ClothericWelcome";

const PROMOTION_DISMISSED_KEY = "outputtracer:clotheric-welcome:v1";
const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

function wasPromotionDismissed() {
  if (typeof window === "undefined") return false;
  try { return window.sessionStorage.getItem(PROMOTION_DISMISSED_KEY) === "1"; }
  catch { return false; }
}

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
  // Keep hydration deterministic without flashing an ad over a returning
  // workspace. Do not mount the IDE or load its runtime before Continue.
  const ready = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const [dismissed, setDismissed] = useState(wasPromotionDismissed);
  if (!ready) return <div role="status" className="flex h-dvh items-center justify-center bg-[#f5f2eb] text-sm text-[#635e52]">Opening OutputTracer…</div>;
  if (dismissed) return <UnifiedShell />;
  return <ClothericWelcome onContinue={() => {
    try { window.sessionStorage.setItem(PROMOTION_DISMISSED_KEY, "1"); }
    catch { /* Continue still works when browser storage is unavailable. */ }
    setDismissed(true);
  }}/>;
}
