"use client";

import { useRef, useState, useEffect, type KeyboardEvent } from "react";
import { Loader2, Paperclip, Send, X, Smile, Mic, Square, Trash2, Flame, MapPin, Navigation } from "lucide-react";
import dynamic from "next/dynamic";
import { Theme } from "emoji-picker-react";
import { PhotoValidationError, validateImageFile } from "@/lib/photo-upload";
import type { Message } from "@/types/database";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface MessageInputProps {
  onSendText: (text: string, expiresInSeconds?: number) => Promise<void> | void;
  onSendPhoto: (file: File, expiresInSeconds?: number) => Promise<void> | void;
  onSendAudio?: (blob: Blob, expiresInSeconds?: number) => Promise<void> | void;
  onSendLocation?: (lat: number, lng: number, expiresInSeconds?: number) => Promise<void> | void;
  onStartLiveLocation?: () => void;
  isLiveLocationActive?: boolean;
  onTyping?: (isTyping: boolean) => void;
  replyingToMessage?: Message | null;
  onCancelReply?: () => void;
  disabled?: boolean;
}

export function MessageInput({ 
  onSendText, 
  onSendPhoto, 
  onSendAudio,
  onSendLocation,
  onStartLiveLocation,
  isLiveLocationActive,
  onTyping, 
  replyingToMessage,
  onCancelReply,
  disabled 
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const [secretMode, setSecretMode] = useState(false);
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        if (recorder.state === "recording") recorder.stop();
        recorder.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleTextChange(val: string) {
    setText(val);
    
    if (onTyping) {
      if (val.length === 0) {
        onTyping(false);
        lastTypingSentRef.current = 0;
      } else {
        const now = Date.now();
        // Only send typing=true at most once every 2 seconds to avoid spamming the websocket
        if (now - lastTypingSentRef.current > 2000) {
          onTyping(true);
          lastTypingSentRef.current = now;
        }
      }
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      validateImageFile(file);
      setFileError(null);
      setPendingFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    } catch (err) {
      setFileError(err instanceof PhotoValidationError ? err.message : "Couldn't use that file.");
    }
    e.target.value = "";
  }

  function cancelPhoto() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(null);
    setPreviewUrl(null);
    setFileError(null);
  }

  async function handleSend() {
    if (sending) return;
    if (pendingFile) {
      setSending(true);
      try {
        await onSendPhoto(pendingFile, secretMode ? 60 : undefined);
        cancelPhoto();
      } finally {
        setSending(false);
      }
      return;
    }
    if (!text.trim()) return;
    setSending(true);
    try {
      await onSendText(text, secretMode ? 60 : undefined);
      setText("");
      setShowEmojiPicker(false);
      if (onTyping) {
        onTyping(false);
        lastTypingSentRef.current = 0;
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (audioChunksRef.current.length > 0 && onSendAudio && !cancelRecordingRef.current) {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          if (mountedRef.current) setSending(true);
          try {
            await onSendAudio(audioBlob, secretMode ? 60 : undefined);
          } finally {
            if (mountedRef.current) {
              setSending(false);
              setIsRecording(false);
              setRecordingDuration(0);
            }
          }
        } else {
          if (mountedRef.current) {
            setIsRecording(false);
            setRecordingDuration(0);
          }
        }
      };

      cancelRecordingRef.current = false;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (err) {
      setFileError("Microphone access denied or unavailable.");
    }
  }

  const cancelRecordingRef = useRef(false);

  function handleSendLocation() {
    if (!onSendLocation || sending) return;
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setSending(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await onSendLocation(position.coords.latitude, position.coords.longitude, secretMode ? 60 : undefined);
          setShowLocationMenu(false);
        } catch (e) {
          alert("Failed to send location");
        } finally {
          setSending(false);
        }
      },
      () => {
        alert("Unable to retrieve your location");
        setSending(false);
      }
    );
  }

  function stopRecording(cancel = false) {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      cancelRecordingRef.current = cancel;
      mediaRecorderRef.current.stop();
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    }
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="border-t border-black/5 bg-card px-3 py-3 sm:px-4">
      {replyingToMessage && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border-l-4 border-primary bg-black/5 p-2 px-3">
          <div className="flex-1 overflow-hidden">
            <p className="text-[10px] font-bold text-primary">Replying to message</p>
            <p className="truncate text-xs text-muted">
              {replyingToMessage.message_type === "image" ? "📷 Photo" : replyingToMessage.message_text}
            </p>
          </div>
          <button
            onClick={onCancelReply}
            className="rounded-full p-1.5 text-muted hover:bg-black/10 hover:text-ink"
            aria-label="Cancel reply"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {previewUrl && (
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-black/5 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Selected preview" className="h-14 w-14 rounded-lg object-cover" />
          <span className="flex-1 truncate text-xs text-muted">{pendingFile?.name}</span>
          <button
            onClick={cancelPhoto}
            className="rounded-full p-1.5 text-muted hover:bg-black/10 hover:text-ink"
            aria-label="Cancel photo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {fileError && <p className="mb-2 text-xs text-red-600">{fileError}</p>}

      <div className="relative flex items-end gap-2">
        {showEmojiPicker && (
          <div className="absolute bottom-14 left-0 z-50">
            <EmojiPicker 
              onEmojiClick={(emoji) => {
                handleTextChange(text + emoji.emoji);
              }}
              theme={Theme.AUTO}
              lazyLoadEmojis={true}
            />
          </div>
        )}

        <button
          onClick={() => setSecretMode(!secretMode)}
          disabled={disabled || sending}
          className={`rounded-full p-2.5 transition hover:bg-black/5 disabled:opacity-50 ${
            secretMode ? "text-red-500 bg-red-500/10" : "text-muted hover:text-red-500"
          }`}
          aria-label="Toggle secret mode (60s self-destruct)"
          title="Self-Destruct (60s)"
        >
          <Flame className="h-5 w-5" />
        </button>
        
        {onSendLocation && (
          <div className="relative">
            {showLocationMenu && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex w-48 flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-xl origin-bottom">
                <button
                  onClick={handleSendLocation}
                  disabled={sending}
                  className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-ink transition hover:bg-black/5"
                >
                  <MapPin className="h-4 w-4 text-primary" /> Send Current Pin
                </button>
                {onStartLiveLocation && (
                  <button
                    onClick={() => {
                      onStartLiveLocation();
                      setShowLocationMenu(false);
                    }}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition hover:bg-black/5 ${
                      isLiveLocationActive ? "text-red-500" : "text-ink"
                    }`}
                  >
                    <Navigation className={`h-4 w-4 ${isLiveLocationActive ? "text-red-500 animate-pulse" : "text-blue-500"}`} /> 
                    {isLiveLocationActive ? "Stop Live Location" : "Share Live Location"}
                  </button>
                )}
              </div>
            )}
            <button
              onClick={() => setShowLocationMenu(!showLocationMenu)}
              disabled={disabled || sending}
              className={`rounded-full p-2.5 transition disabled:opacity-50 ${
                showLocationMenu || isLiveLocationActive ? "text-blue-500 bg-blue-500/10" : "text-muted hover:text-blue-500 hover:bg-black/5"
              }`}
              aria-label="Share location"
              title="Share Location"
            >
              <MapPin className="h-5 w-5" />
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="hidden"
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || sending}
          className="rounded-full p-2.5 text-muted transition hover:bg-black/5 hover:text-primary disabled:opacity-50"
          aria-label="Attach photo"
        >
          <Paperclip className="h-5 w-5" />
        </button>

        <button
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          disabled={disabled || sending || isRecording}
          className={`rounded-full p-2.5 transition hover:bg-black/5 disabled:opacity-50 ${
            showEmojiPicker ? "text-primary bg-primary/10" : "text-muted hover:text-primary"
          }`}
          aria-label="Toggle emoji picker"
        >
          <Smile className="h-5 w-5" />
        </button>

        {isRecording ? (
          <div className="flex flex-1 items-center justify-between rounded-2xl border border-red-500/30 bg-red-50 px-4 py-2 text-sm text-red-600 shadow-inner">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="font-medium">{formatDuration(recordingDuration)}</span>
            </div>
            <button
              onClick={() => stopRecording(true)}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-xs hover:bg-red-100"
            >
              <Trash2 className="h-4 w-4" /> Cancel
            </button>
          </div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || sending || Boolean(pendingFile)}
            placeholder="Message…"
            rows={1}
            className="max-h-32 flex-1 resize-none rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
        )}

        {isRecording ? (
          <button
            onClick={() => stopRecording(false)}
            disabled={sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send voice note"
          >
            {sending ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Send className="h-4.5 w-4.5" />}
          </button>
        ) : text.trim() || pendingFile ? (
          <button
            onClick={handleSend}
            disabled={disabled || sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            {sending ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Send className="h-4.5 w-4.5" />}
          </button>
        ) : (
          <button
            onClick={startRecording}
            disabled={disabled || sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-muted transition hover:bg-black/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Record voice note"
          >
            <Mic className="h-4.5 w-4.5" />
          </button>
        )}
      </div>
    </div>
  );
}
