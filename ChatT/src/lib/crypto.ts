/**
 * End-to-End Encryption utilities using the Web Crypto API.
 * Uses AES-GCM with a 256-bit key derived from a user-provided passphrase.
 * 
 * Encrypted messages are stored as: `e2ee::<base64(iv)>::<base64(ciphertext)>`
 * This prefix lets the app distinguish encrypted messages from plain text,
 * allowing graceful fallback for older unencrypted messages.
 */

const E2EE_PREFIX = "e2ee::";
const SALT = "private-chat-e2ee-salt-v1";

/**
 * Derive a 256-bit AES-GCM key from a passphrase using PBKDF2.
 * Caches the derived key to prevent running 100k iterations repeatedly.
 */
const keyCache = new Map<string, CryptoKey>();

export async function deriveKey(passphrase: string): Promise<CryptoKey> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("Web Crypto API is not available");
  }

  if (keyCache.has(passphrase)) {
    return keyCache.get(passphrase)!;
  }

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const derived = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(SALT),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  keyCache.set(passphrase, derived);
  return derived;
}

// Helper for safe base64 encoding without stack overflow
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // Process in chunks to avoid stack overflow
  const chunkSize = 0x8000; 
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

/**
 * Encrypt a plaintext string. Returns the format: `e2ee::<base64(iv)>::<base64(ciphertext)>`
 */
export async function encryptMessage(plaintext: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  const ivB64 = bufferToBase64(iv.buffer);
  const ctB64 = bufferToBase64(ciphertext);
  return `${E2EE_PREFIX}${ivB64}::${ctB64}`;
}

/**
 * Decrypt a message string. If it doesn't have the e2ee prefix or decryption
 * fails, returns the original string as-is (graceful fallback for plain text
 * or messages encrypted with a different key).
 */
export async function decryptMessage(encrypted: string, key: CryptoKey): Promise<string> {
  if (!encrypted.startsWith(E2EE_PREFIX)) {
    return encrypted;
  }

  try {
    const payload = encrypted.slice(E2EE_PREFIX.length);
    const [ivB64, ctB64] = payload.split("::");
    if (!ivB64 || !ctB64) return encrypted;

    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return "\ud83d\udd12 Unable to decrypt (wrong key?)";
  }
}

/**
 * Check if a message is encrypted.
 */
export function isEncrypted(text: string): boolean {
  return text.startsWith(E2EE_PREFIX);
}

/**
 * Get the E2EE passphrase from localStorage, or null if not set.
 */
export function getStoredPassphrase(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("e2ee_secret") || null;
}

/**
 * Store the E2EE passphrase in localStorage.
 */
export function setStoredPassphrase(passphrase: string): void {
  localStorage.setItem("e2ee_secret", passphrase);
}

/**
 * Remove the stored E2EE passphrase.
 */
export function removeStoredPassphrase(): void {
  localStorage.removeItem("e2ee_secret");
}
