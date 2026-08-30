"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Heart, ImageOff } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { getSignedPhotoUrl } from "@/lib/photo-upload";
import { PhotoLightbox } from "@/components/ChatExtras";
import { formatDayDivider } from "@/lib/format";
import type { Message, Profile, SavedPhoto } from "@/types/database";

interface SavedPhotoEntry {
  saved: SavedPhoto;
  message: Message;
  sender: Profile | null;
  url: string | null;
}

export default function MemoriesPage() {
  const supabase = createClient();
  const [entries, setEntries] = useState<SavedPhotoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: saved } = await supabase
        .from("saved_photos")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!saved || saved.length === 0) {
        if (!cancelled) {
          setEntries([]);
          setLoading(false);
        }
        return;
      }

      const messageIds = saved.map((s) => s.message_id);
      const { data: messages } = await supabase.from("messages").select("*").in("id", messageIds);

      const senderIds = Array.from(new Set((messages ?? []).map((m) => m.sender_id)));
      const { data: senders } = await supabase.from("profiles").select("*").in("id", senderIds);

      const built: SavedPhotoEntry[] = [];
      for (const s of saved) {
        const message = (messages ?? []).find((m) => m.id === s.message_id);
        if (!message || !message.attachment_path) continue;
        const sender = (senders ?? []).find((p) => p.id === message.sender_id) ?? null;
        const url = await getSignedPhotoUrl(message.attachment_path);
        built.push({ saved: s, message, sender, url });
      }

      if (!cancelled) {
        setEntries(built);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUnsave(messageId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("saved_photos").delete().eq("user_id", user.id).eq("message_id", messageId);
    setEntries((prev) => prev.filter((e) => e.message.id !== messageId));
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center gap-3 border-b border-black/5 bg-card px-4 py-3">
        <Link href="/chat" className="rounded-full p-1.5 text-muted hover:bg-black/5" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-sm font-semibold text-ink">Saved Photos</h1>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {loading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-xl bg-black/5" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <ImageOff className="mb-3 h-10 w-10 text-muted" />
            <p className="text-sm font-medium text-ink">No saved photos yet</p>
            <p className="mt-1 text-xs text-muted">Tap the heart on any photo in chat to save it here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {entries.map((entry) => (
              <button
                key={entry.saved.id}
                onClick={() => entry.url && setLightboxUrl(entry.url)}
                className="group relative aspect-square overflow-hidden rounded-xl bg-black/5"
              >
                {entry.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.url}
                    alt="Saved photo"
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted">
                    Unavailable
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent p-2 text-left opacity-0 transition group-hover:opacity-100">
                  <span className="text-[10px] text-white">
                    {entry.sender?.display_name} · {formatDayDivider(entry.message.created_at)}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnsave(entry.message.id);
                    }}
                    className="rounded-full bg-white/20 p-1 text-white hover:bg-white/30"
                    aria-label="Unsave photo"
                  >
                    <Heart className="h-3.5 w-3.5 fill-white" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {lightboxUrl && <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </main>
  );
}
