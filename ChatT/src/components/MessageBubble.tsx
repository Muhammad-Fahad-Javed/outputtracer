"use client";

import { useEffect, useState } from "react";
import { Check, CheckCheck, Heart, Reply, SmilePlus, Flame, MapPin } from "lucide-react";
import { Map, Marker } from "pigeon-maps";
import type { Message } from "@/types/database";
import { formatMessageTime } from "@/lib/format";
import { fetchPhotoBlob, deleteStoragePhoto } from "@/lib/photo-upload";
import {
  getCachedPhoto,
  cachePhoto,
  downloadPhotoToDevice,
  getAutoSavePreference,
} from "@/lib/photo-cache";
import { fetchAudioBlob, deleteStorageAudio } from "@/lib/audio-upload";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isSaved: boolean;
  onSavePhoto: (messageId: string) => void;
  onOpenPhoto: (url: string) => void;
  onReply?: (message: Message) => void;
  onReact?: (message: Message, emoji: string) => void;
  onDelete?: (messageId: string) => void;
  repliedMessage?: Message | null;
}

import React from "react";

export const MessageBubble = React.memo(function MessageBubble({ 
  message, 
  isOwn, 
  isSaved, 
  onSavePhoto, 
  onOpenPhoto,
  onReply,
  onReact,
  onDelete,
  repliedMessage
}: MessageBubbleProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showReactionsMenu, setShowReactionsMenu] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [locationCoords, setLocationCoords] = useState<[number, number] | null>(null);

  const AVAILABLE_REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "👎"];

  // Self-destruct logic
  useEffect(() => {
    if (!message.expires_in_seconds || !message.read_at || !onDelete) return;

    const readAtTime = new Date(message.read_at).getTime();
    const expiresAt = readAtTime + message.expires_in_seconds * 1000;
    
    const checkExpiry = () => {
      const remaining = Math.max(0, expiresAt - Date.now());
      setTimeLeft(Math.ceil(remaining / 1000));
      
      if (remaining <= 0) {
        onDelete(message.id);
      }
    };

    // Initial check
    checkExpiry();

    const interval = setInterval(checkExpiry, 1000);
    return () => clearInterval(interval);
  }, [message.read_at, message.expires_in_seconds, message.id, onDelete]);

  useEffect(() => {
    if (!message.attachment_path) return;
    if (message.message_type !== "image" && message.message_type !== "audio") return;
    
    let cancelled = false;
    const path = message.attachment_path;

    async function loadMedia() {
      if (message.message_type === "image") {
        const cachedUrl = await getCachedPhoto(path);
        if (cachedUrl) {
          if (!cancelled) setPhotoUrl(cachedUrl);
          return;
        }

        const blob = await fetchPhotoBlob(path);
        if (cancelled) return;
        if (!blob) return setPhotoError(true);

        try { await cachePhoto(path, blob); } catch {}
        if (!cancelled) setPhotoUrl(URL.createObjectURL(blob));

        if (!isOwn) {
          deleteStoragePhoto(path).catch(() => {});
          if (getAutoSavePreference()) {
            const extension = path.split(".").pop() ?? "jpg";
            downloadPhotoToDevice(blob, `chat-photo-${Date.now()}.${extension}`);
          }
        }
      } else if (message.message_type === "audio") {
        try {
          const blob = await fetchAudioBlob(path);
          if (cancelled) return;
          if (blob) {
            const url = URL.createObjectURL(blob);
            if (cancelled) return;
            setAudioUrl(url);
            if (!isOwn) {
              deleteStorageAudio(path).catch(() => {});
            }
          }
        } catch (err) {
          console.error("Failed to load audio", err);
        }
      }
    }

    loadMedia();
    return () => {
      cancelled = true;
      if (photoUrl && photoUrl.startsWith("blob:")) URL.revokeObjectURL(photoUrl);
      if (audioUrl && audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.attachment_path, message.message_type, isOwn]);

  useEffect(() => {
    if (message.message_type === "location" && message.message_text) {
      const parts = message.message_text.split(",");
      if (parts.length === 2) {
        const lat = Number(parts[0]);
        const lng = Number(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          setLocationCoords([lat, lng]);
        }
      }
    }
  }, [message.message_type, message.message_text]);

  const status = isOwn
    ? message.read_at
      ? "read"
      : message.delivered_at
        ? "delivered"
        : "sent"
    : null;

  const hasReactions = message.reactions && Object.keys(message.reactions).length > 0;
  // Get unique emojis used
  const reactionEmojis = hasReactions ? Array.from(new Set(Object.values(message.reactions!))) : [];

  return (
    <div className={`group relative flex w-full animate-message-in ${isOwn ? "justify-end" : "justify-start"}`}>
      {/* Hover Actions Menu */}
      <div className={`absolute top-0 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 ${
        isOwn ? "right-[100%] mr-2" : "left-[100%] ml-2"
      }`}>
        <button 
          onClick={() => setShowReactionsMenu(!showReactionsMenu)}
          className="rounded-full bg-black/5 p-1.5 text-muted hover:bg-black/10 hover:text-ink"
        >
          <SmilePlus className="h-4 w-4" />
        </button>
        <button 
          onClick={() => onReply?.(message)}
          className="rounded-full bg-black/5 p-1.5 text-muted hover:bg-black/10 hover:text-ink"
        >
          <Reply className="h-4 w-4" />
        </button>
        
        {/* Reactions Picker Popup */}
        {showReactionsMenu && (
          <div className={`absolute top-8 z-10 flex gap-1 rounded-full bg-white p-1.5 shadow-md border border-black/5 ${
            isOwn ? "right-0" : "left-0"
          }`}>
            {AVAILABLE_REACTIONS.map(emoji => (
              <button
                key={emoji}
                onClick={() => {
                  onReact?.(message, emoji);
                  setShowReactionsMenu(false);
                }}
                className="rounded-full p-1 text-base hover:bg-black/5"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex max-w-[78%] flex-col sm:max-w-[65%]">
        {/* Quoted Reply */}
        {repliedMessage && (
          <div className={`mb-1 overflow-hidden rounded-xl border-l-4 border-primary/50 bg-black/5 px-3 py-1.5 opacity-80 ${
            isOwn ? "self-end" : "self-start"
          }`}>
            <p className="text-[10px] font-bold text-primary">Replying</p>
            <p className="line-clamp-2 text-xs text-muted">
              {repliedMessage.message_type === "image" ? "📷 Photo" : repliedMessage.message_text}
            </p>
          </div>
        )}

        {/* Main Bubble */}
        <div
          className={`relative rounded-bubble px-3 py-2 shadow-sm ${
            isOwn ? "rounded-br-md bg-bubbleOut" : "rounded-bl-md bg-bubbleIn"
          } ${message.expires_in_seconds ? "ring-1 ring-red-500/50" : ""}`}
        >
          {message.expires_in_seconds && (
            <div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-red-500">
              <Flame className="h-3 w-3" /> 
              {timeLeft !== null ? `Destructing in ${timeLeft}s` : `Self-Destruct (${message.expires_in_seconds}s)`}
            </div>
          )}
          {message.message_type === "image" ? (
          <div className="space-y-1">
            {photoError && (
              <div className="flex h-40 w-56 items-center justify-center rounded-xl bg-black/5 text-xs text-muted">
                Photo unavailable
              </div>
            )}
            {!photoError && !photoUrl && (
              <div className="h-40 w-56 animate-pulse rounded-xl bg-black/5" />
            )}
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="Shared photo"
                loading="lazy"
                onClick={() => onOpenPhoto(photoUrl)}
                className="max-h-72 w-full cursor-pointer rounded-xl object-cover"
              />
            )}
            <div className="flex items-center justify-between px-0.5 pt-0.5">
              <button
                onClick={() => onSavePhoto(message.id)}
                className={`flex items-center gap-1 text-xs font-medium ${
                  isSaved ? "text-red-500" : "text-muted hover:text-red-500"
                }`}
              >
                <Heart className={`h-3.5 w-3.5 ${isSaved ? "fill-red-500" : ""}`} />
                {isSaved ? "Saved" : "Save"}
              </button>
              <MessageMeta timestamp={message.created_at} status={status} />
            </div>
          </div>
        ) : message.message_type === "audio" ? (
          <div className="flex flex-col gap-1.5">
            {audioUrl ? (
              <audio src={audioUrl} controls className="h-9 w-48 max-w-full" />
            ) : (
              <div className="flex h-9 w-48 animate-pulse items-center justify-center rounded-full bg-black/5 text-xs text-muted">
                Loading...
              </div>
            )}
            <div className="flex justify-end">
              <MessageMeta timestamp={message.created_at} status={status} />
            </div>
          </div>
        ) : message.message_type === "location" ? (
          <div className="space-y-1">
            <div className="h-40 w-56 overflow-hidden rounded-xl bg-black/5">
              {locationCoords ? (
                <Map 
                  height={160} 
                  center={locationCoords} 
                  defaultZoom={15} 
                  mouseEvents={false} 
                  touchEvents={false}
                >
                  <Marker 
                    width={30} 
                    anchor={locationCoords} 
                    color="red" 
                  />
                </Map>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                  Invalid Location
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-0.5 pt-0.5">
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${message.message_text}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
              >
                <MapPin className="h-3 w-3" /> Open in Maps
              </a>
              <MessageMeta timestamp={message.created_at} status={status} />
            </div>
          </div>
        ) : (
          <div>
            <p className="whitespace-pre-wrap break-words text-sm text-ink">{message.message_text}</p>
            <div className="mt-1 flex justify-end">
              <MessageMeta timestamp={message.created_at} status={status} />
            </div>
          </div>
        )}

        {/* Reactions Display */}
        {hasReactions && (
          <div className={`absolute -bottom-2.5 flex items-center gap-1 rounded-full border border-white bg-black/5 px-1.5 py-0.5 text-xs shadow-sm ${
            isOwn ? "right-2" : "left-2"
          }`}>
            {reactionEmojis.map(emoji => (
              <span key={emoji}>{emoji}</span>
            ))}
            <span className="text-[10px] font-medium text-muted">
              {Object.keys(message.reactions!).length > 1 ? Object.keys(message.reactions!).length : ""}
            </span>
          </div>
        )}
        </div>
      </div>
    </div>
  );
});

function MessageMeta({
  timestamp,
  status,
}: {
  timestamp: string;
  status: "sent" | "delivered" | "read" | null;
}) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted">
      {formatMessageTime(timestamp)}
      {status === "sent" && <Check className="h-3 w-3" />}
      {status === "delivered" && <CheckCheck className="h-3 w-3" />}
      {status === "read" && <CheckCheck className="h-3 w-3 text-primary" />}
    </span>
  );
}
