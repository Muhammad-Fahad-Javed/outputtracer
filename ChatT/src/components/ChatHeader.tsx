"use client";

import Link from "next/link";
import { ArrowLeft, Image as ImageIcon, Settings, Notebook } from "lucide-react";
import type { Profile } from "@/types/database";
import { formatLastSeen } from "@/lib/format";

interface ChatHeaderProps {
  partner: Profile | null;
  isPartnerOnline: boolean;
  lastSeen: string | null;
  onBack?: () => void;
  onOpenNotes?: () => void;
}

export function ChatHeader({ partner, isPartnerOnline, lastSeen, onBack, onOpenNotes }: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-black/5 bg-card/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="rounded-full p-1.5 text-muted hover:bg-black/5 md:hidden"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}

        <div className="relative">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {partner?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={partner.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              (partner?.display_name ?? "?").slice(0, 1).toUpperCase()
            )}
          </div>
          <span
            className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card ${
              isPartnerOnline ? "bg-accent" : "bg-neutral-300"
            }`}
            aria-hidden
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-ink">{partner?.display_name ?? "Loading…"}</p>
          <p className={`text-xs ${isPartnerOnline ? "text-accent-dark" : "text-muted"}`}>
            {isPartnerOnline ? "Online" : formatLastSeen(lastSeen)}
          </p>
        </div>
      </div>

      <nav className="flex items-center gap-1" aria-label="Chat navigation">
        {onOpenNotes && (
          <button
            onClick={onOpenNotes}
            className="rounded-full p-2 text-muted transition hover:bg-black/5 hover:text-ink"
            aria-label="Shared notes"
          >
            <Notebook className="h-5 w-5" />
          </button>
        )}
        <Link
          href="/memories"
          className="rounded-full p-2 text-muted transition hover:bg-black/5 hover:text-ink"
          aria-label="Saved photos"
        >
          <ImageIcon className="h-5 w-5" />
        </Link>
        <Link
          href="/settings"
          className="rounded-full p-2 text-muted transition hover:bg-black/5 hover:text-ink"
          aria-label="Settings"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </nav>
    </header>
  );
}
