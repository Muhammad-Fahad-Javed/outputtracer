import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase-browser";

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const BUCKET = "chat-photos";

export class PhotoValidationError extends Error {}

export function validateImageFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (!ALLOWED_MIME_TYPES.includes(file.type) || !ALLOWED_EXTENSIONS.includes(extension)) {
    throw new PhotoValidationError("Only JPG, PNG, and WEBP images are supported.");
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new PhotoValidationError("Image is too large. Maximum size is 10 MB.");
  }

  return extension;
}

/**
 * Compresses, uploads to the private 'chat-photos' bucket under a path of
 * the form <conversationId>/<userId>/<uuid>.<ext>, and returns the storage
 * object path (NOT a public URL — this bucket has no public access; view
 * URLs are always minted on demand via createSignedUrl).
 */
export async function uploadChatPhoto(
  file: File,
  conversationId: string,
  userId: string
): Promise<string> {
  const extension = validateImageFile(file);
  const supabase = createClient();

  let uploadFile: File | Blob = file;
  try {
    uploadFile = await imageCompression(file, {
      maxSizeMB: 2,
      maxWidthOrHeight: 2000,
      useWebWorker: true,
    });
  } catch {
    // If compression fails for any reason, fall back to the original file
    // (still within the 10MB validated limit above).
    uploadFile = file;
  }

  const objectPath = `${conversationId}/${userId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, uploadFile, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw new Error("Upload failed. Please check your connection and try again.");
  }

  return objectPath;
}

/**
 * Photos live in a private bucket, so viewing one always requires a
 * short-lived signed URL minted server-side-equivalent (via the anon key +
 * RLS-checked storage policy) rather than a permanent public link.
 */
export async function getSignedPhotoUrl(objectPath: string, expiresInSeconds = 3600) {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, expiresInSeconds);

  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Fetch a photo as a raw Blob via its signed URL. Used to download the
 * photo into IndexedDB before deleting it from Supabase Storage.
 */
export async function fetchPhotoBlob(objectPath: string): Promise<Blob | null> {
  const url = await getSignedPhotoUrl(objectPath);
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

/**
 * Delete a photo from the private Supabase Storage bucket. Called after the
 * receiver has successfully cached the photo in IndexedDB, so the server
 * copy is no longer needed.
 */
export async function deleteStoragePhoto(objectPath: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.storage.from(BUCKET).remove([objectPath]);
  return !error;
}

