"use client";

import { X } from "lucide-react";

export function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center justify-center">
      <span className="rounded-full bg-black/5 px-3 py-1 text-[11px] font-medium text-muted">
        {label}
      </span>
    </div>
  );
}

export function EmptyChatState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <span className="text-2xl">💬</span>
      </div>
      <p className="text-sm font-medium text-ink">Your private space starts here.</p>
      <p className="mt-1 text-xs text-muted">Send your first message.</p>
    </div>
  );
}

export function PhotoLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Close photo"
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Full-screen photo"
        className="max-h-full max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export function ChatLoadingState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      <p className="text-xs text-muted">Loading your conversation…</p>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex animate-message-in justify-start">
      <div className="flex w-fit items-center gap-1.5 rounded-bubble rounded-bl-md bg-bubbleIn px-3.5 py-2.5 shadow-sm">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/60" style={{ animationDelay: "0ms" }} />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/60" style={{ animationDelay: "150ms" }} />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/60" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}
