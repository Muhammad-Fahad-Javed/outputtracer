/**
 * scripts/create-storage-bucket.ts
 *
 * One-time setup: creates the private 'chat-photos' storage bucket.
 * Run with: npx tsx scripts/create-storage-bucket.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
 * environment. After running this, apply supabase/policies/storage_policies.sql
 * via the SQL editor or the Supabase CLI.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) throw listError;

  if (buckets.some((b) => b.name === "chat-photos")) {
    console.log("Bucket 'chat-photos' already exists. Skipping.");
    return;
  }

  const { error } = await admin.storage.createBucket("chat-photos", {
    public: false, // CRITICAL: must stay private. Access is via RLS + signed URLs only.
    fileSizeLimit: "10MB",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });

  if (error) throw error;
  console.log("Created private bucket 'chat-photos'.");
  console.log("Next: apply supabase/policies/storage_policies.sql to this project.");
}

main().catch((err) => {
  console.error("Failed to create bucket:", err);
  process.exit(1);
});
