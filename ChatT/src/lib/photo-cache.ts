/**
 * Local photo cache using IndexedDB.
 *
 * Photos are cached as Blobs keyed by their Supabase Storage object path.
 * This allows photos to persist locally after they've been deleted from
 * Supabase Storage, enabling ephemeral server-side photo delivery.
 *
 * No external dependencies — uses the raw IndexedDB API with a thin
 * promise wrapper.
 */

const DB_NAME = "chat-photo-cache";
const DB_VERSION = 1;
const STORE_NAME = "photos";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save a photo blob to IndexedDB, keyed by its storage object path.
 */
export async function cachePhoto(path: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, path);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Retrieve a cached photo as an object URL. Returns null if not cached.
 * The caller is responsible for revoking the object URL when done.
 */
export async function getCachedPhoto(path: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(path);
    request.onsuccess = () => {
      db.close();
      const blob = request.result as Blob | undefined;
      if (blob) {
        resolve(URL.createObjectURL(blob));
      } else {
        resolve(null);
      }
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Check whether a photo is already cached locally.
 */
export async function hasCachedPhoto(path: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).count(path);
    request.onsuccess = () => {
      db.close();
      resolve(request.result > 0);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Remove a cached photo from IndexedDB.
 */
export async function deleteCachedPhoto(path: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(path);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Trigger a browser download for a blob, saving it to the device's
 * Downloads folder (which on mobile often appears in the gallery).
 */
export function downloadPhotoToDevice(blob: Blob, filename?: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `photo-${Date.now()}.jpg`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a short delay to ensure the download starts
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Get the auto-save photos preference from localStorage.
 */
export function getAutoSavePreference(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("auto_save_photos") === "true";
}

/**
 * Set the auto-save photos preference in localStorage.
 */
export function setAutoSavePreference(enabled: boolean): void {
  localStorage.setItem("auto_save_photos", enabled ? "true" : "false");
}

const WALLPAPER_KEY = "custom_chat_wallpaper";

export async function saveWallpaperToCache(blob: Blob): Promise<void> {
  await cachePhoto(WALLPAPER_KEY, blob);
}

export async function getWallpaperFromCache(): Promise<string | null> {
  return await getCachedPhoto(WALLPAPER_KEY);
}

export async function deleteWallpaperFromCache(): Promise<void> {
  await deleteCachedPhoto(WALLPAPER_KEY);
}
