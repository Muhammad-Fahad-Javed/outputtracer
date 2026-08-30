import { createClient } from "@/lib/supabase-browser";

export const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const BUCKET = "chat-audio";

export class AudioValidationError extends Error {}

export function validateAudioFile(file: File | Blob) {
  if (file.size > MAX_AUDIO_SIZE_BYTES) {
    throw new AudioValidationError("Audio is too large. Maximum size is 10 MB.");
  }
}

/**
 * Uploads an audio blob to the private 'chat-audio' bucket.
 */
export async function uploadChatAudio(
  file: File | Blob,
  conversationId: string,
  userId: string
): Promise<string> {
  validateAudioFile(file);
  const supabase = createClient();
  
  // We'll just use .webm or whatever the browser generates, or generic .m4a
  const objectPath = `${conversationId}/${userId}/${crypto.randomUUID()}.webm`;

  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, file, {
    contentType: file.type || "audio/webm",
    upsert: false,
  });

  if (error) {
    throw new Error("Audio upload failed. Please check your connection and try again.");
  }

  return objectPath;
}

export async function getSignedAudioUrl(objectPath: string, expiresInSeconds = 3600) {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, expiresInSeconds);

  if (error || !data) return null;
  return data.signedUrl;
}

export async function fetchAudioBlob(objectPath: string): Promise<Blob | null> {
  const url = await getSignedAudioUrl(objectPath);
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

export async function deleteStorageAudio(objectPath: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.storage.from(BUCKET).remove([objectPath]);
  return !error;
}
