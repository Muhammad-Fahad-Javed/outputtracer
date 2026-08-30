/**
 * Google Drive Backup & Restore Utilities
 * 
 * Uses Google Identity Services (GIS) for OAuth 2.0 authorization and
 * the Google Drive REST API v3 for uploading/downloading appDataFolder files.
 */

// Declare the Google Identity Services global
declare global {
  interface Window {
    google?: any;
  }
}

const SCOPES = "https://www.googleapis.com/auth/drive.appdata";
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const STORAGE_KEY = "google_drive_token";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export interface BackupData {
  version: 1;
  timestamp: string;
  messages: any[]; // We store full message objects
  photos: { path: string; base64: string }[];
}

/**
 * Check if the user has a stored Google Drive access token.
 * Note: This doesn't guarantee the token is still valid (it might have expired),
 * but it's a good initial UI check. If an API call fails with 401, they'll need
 * to link again.
 */
export function isGoogleLinked(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(STORAGE_KEY);
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function unlinkGoogleAccount(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Initialize the Google Identity Services token client and request an access token.
 */
export function linkGoogleAccount(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.google) {
      reject(new Error("Google Identity Services script not loaded."));
      return;
    }

    if (!CLIENT_ID) {
      reject(new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured."));
      return;
    }

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response: TokenResponse | { error: string }) => {
          if ("error" in response) {
            reject(new Error(response.error));
            return;
          }
          localStorage.setItem(STORAGE_KEY, response.access_token);
          resolve(response.access_token);
        },
        error_callback: (error: any) => {
          reject(error);
        },
      });

      client.requestAccessToken();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Ensure we have a valid token. If missing, prompt the user to link.
 */
async function ensureToken(): Promise<string> {
  let token = getStoredToken();
  if (!token) {
    token = await linkGoogleAccount();
  }
  return token;
}

/**
 * Create a new backup file in the Google Drive appDataFolder.
 */
export async function createBackup(data: BackupData): Promise<void> {
  const token = await ensureToken();
  
  const metadata = {
    name: `chatt-backup-${new Date().toISOString()}.json`,
    parents: ["appDataFolder"],
  };

  // Step 1: Create metadata
  const metaResponse = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!metaResponse.ok) {
    if (metaResponse.status === 401) {
      unlinkGoogleAccount();
      throw new Error("Google Drive session expired. Please relink your account.");
    }
    throw new Error(`Failed to create backup file metadata: ${metaResponse.statusText}`);
  }

  const file = await metaResponse.json();

  // Upload content
  try {
    const uploadResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=media`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload backup content: ${uploadResponse.statusText}`);
    }
  } catch (error) {
    // Attempt rollback/cleanup of the empty orphan file if upload fails
    await deleteBackupFile(file.id).catch(() => {});
    throw error;
  }
}



export interface BackupFileInfo {
  id: string;
  name: string;
  createdTime: string;
  size: string;
}

/**
 * List all backup files stored in the appDataFolder.
 */
export async function listBackups(): Promise<BackupFileInfo[]> {
  const token = await ensureToken();

  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,createdTime,size)&orderBy=createdTime desc",
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      unlinkGoogleAccount();
      throw new Error("Google session expired. Please link your account again.");
    }
    throw new Error(`Failed to list backups: ${response.statusText}`);
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * Download and parse a specific backup file by ID.
 */
export async function restoreBackup(fileId: string): Promise<BackupData> {
  const token = await ensureToken();

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      unlinkGoogleAccount();
      throw new Error("Google session expired. Please link your account again.");
    }
    throw new Error(`Failed to download backup: ${response.statusText}`);
  }

  const data = await response.json();
  return data as BackupData;
}

/**
 * Delete a specific backup file by ID.
 */
export async function deleteBackupFile(fileId: string): Promise<void> {
  const token = await ensureToken();

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      unlinkGoogleAccount();
      throw new Error("Google session expired. Please link your account again.");
    }
    throw new Error(`Failed to delete backup: ${response.statusText}`);
  }
}

/**
 * Helper to convert a Blob to a base64 string.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Extract just the base64 part, removing the "data:image/jpeg;base64," prefix
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Helper to convert a base64 string back to a Blob.
 */
export function base64ToBlob(base64: string, mimeType: string = "image/jpeg"): Promise<Blob> {
  return fetch(`data:${mimeType};base64,${base64}`).then((res) => res.blob());
}
