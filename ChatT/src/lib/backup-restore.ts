import { createClient } from "@/lib/supabase-browser";
import {
  createBackup,
  restoreBackup,
  BackupData,
  blobToBase64,
  base64ToBlob,
} from "./google-drive";
import { cachePhoto, getCachedPhoto } from "./photo-cache";

export async function performFullBackup(conversationId: string): Promise<void> {
  const supabase = createClient();
  
  // 1. Fetch all messages
  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(10000); // Increased limit to prevent silent truncation

  if (messagesError || !messages) throw new Error("Failed to fetch messages for backup.");

  const photos: { path: string; base64: string }[] = [];

  for (const msg of messages) {
    if ((msg.message_type === "image" || msg.message_type === "audio") && msg.attachment_path) {
      const cachedUrl = await getCachedPhoto(msg.attachment_path);
      if (cachedUrl) {
        try {
          const res = await fetch(cachedUrl);
          const blob = await res.blob();
        
          // Use FileReader instead of Data URI to avoid length limits
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
            reader.readAsDataURL(blob);
          });

          photos.push({ path: msg.attachment_path, base64 });
        } catch (e) {
          console.warn(`Failed to package media ${msg.attachment_path} for backup`, e);
        } finally {
          if (cachedUrl) URL.revokeObjectURL(cachedUrl);
        }
      }
    }
  }

  // 3. Create backup object
  const backupData: BackupData = {
    version: 1,
    timestamp: new Date().toISOString(),
    messages: messages || [],
    photos,
  };

  // 4. Upload to Google Drive
  await createBackup(backupData);
}

export async function performFullRestore(fileId: string): Promise<void> {
  const data = await restoreBackup(fileId);
  const supabase = createClient();

  if (!data || !data.messages) {
    throw new Error("Invalid backup file.");
  }

  // 1. Restore messages
  // We use upsert to avoid duplicating existing messages
  if (data.messages && data.messages.length > 0) {
    const { error: upsertError } = await supabase
      .rpc("restore_messages" as any, { messages: data.messages });

    if (upsertError) {
      throw new Error("Failed to restore messages: " + upsertError.message);
    }
  }

  // Restore cached media using atob and buffer chunks to avoid Data URI fetch() limit
  if (data.photos && data.photos.length > 0) {
    for (const photo of data.photos) {
      try {
        const binaryString = atob(photo.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "application/octet-stream" });
        await cachePhoto(photo.path, blob);
      } catch (e) {
        console.warn(`Failed to restore media ${photo.path}`, e);
      }
    }
  }
}
