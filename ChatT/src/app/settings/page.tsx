"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, LogOut, Moon, Sun, User, Shield, Cloud, RefreshCw, CheckCircle2, Palette, Image as ImageIcon, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import type { Profile } from "@/types/database";
import { getStoredPassphrase, setStoredPassphrase, removeStoredPassphrase } from "@/lib/crypto";
import { getAutoSavePreference, setAutoSavePreference, saveWallpaperToCache, deleteWallpaperFromCache } from "@/lib/photo-cache";
import { useTheme, THEME_COLORS, ThemeColor } from "@/hooks/useTheme";
import { useAuthUser } from "@/hooks/useAuthUser";
import { isGoogleLinked, linkGoogleAccount, unlinkGoogleAccount, listBackups, BackupFileInfo } from "@/lib/google-drive";
import { performFullBackup, performFullRestore } from "@/lib/backup-restore";

export default function SettingsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [e2eeSecret, setE2eeSecret] = useState("");
  const [e2eeEnabled, setE2eeEnabled] = useState(false);
  const [autoSavePhotos, setAutoSavePhotos] = useState(false);
  const { themeColor, setThemeColor, wallpaperUrl, refreshWallpaper } = useTheme();
  const [wallpaperUploading, setWallpaperUploading] = useState(false);

  // Backup State
  const { conversationId } = useAuthUser();
  const [googleLinked, setGoogleLinked] = useState(false);
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoadingId, setRestoreLoadingId] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const backupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Theme preference is harmless UI state, fine to keep in localStorage
    // per the spec — everything else (messages, photos, profile) lives in
    // the database.
    const stored = localStorage.getItem("theme");
    const isDark = stored === "dark";
    setDarkMode(isDark);
    document.documentElement.classList.toggle("dark", isDark);

    const existingSecret = localStorage.getItem("e2ee_secret");
    if (existingSecret) {
      setE2eeSecret(existingSecret);
      setE2eeEnabled(true);
    }
    setAutoSavePhotos(getAutoSavePreference());
    
    if (isGoogleLinked()) {
      setGoogleLinked(true);
      refreshBackups();
    }

    return () => {
      mountedRef.current = false;
      if (backupTimeoutRef.current) clearTimeout(backupTimeoutRef.current);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  async function refreshBackups() {
    try {
      const list = await listBackups();
      if (mountedRef.current) setBackups(list);
    } catch (e: any) {
      console.error(e);
      if ((e.message.includes("expired") || e.message.includes("401")) && mountedRef.current) {
        setGoogleLinked(false);
      }
    }
  }

  async function handleLinkGoogle() {
    try {
      await linkGoogleAccount();
      if (mountedRef.current) {
        setGoogleLinked(true);
        refreshBackups();
      }
    } catch (e: any) {
      alert("Failed to link Google account: " + e.message);
    }
  }

  function handleUnlinkGoogle() {
    unlinkGoogleAccount();
    setGoogleLinked(false);
    setBackups([]);
  }

  async function handleBackup() {
    if (!conversationId) {
      alert("No active conversation found to backup.");
      return;
    }
    setBackupLoading(true);
    setBackupMessage("Backing up...");
    try {
      await performFullBackup(conversationId);
      if (mountedRef.current) {
        setBackupMessage("Backup complete ✓");
        refreshBackups();
      }
    } catch (e: any) {
      if (mountedRef.current) setBackupMessage("Backup failed: " + e.message);
    } finally {
      if (mountedRef.current) {
        setBackupLoading(false);
        if (backupTimeoutRef.current) clearTimeout(backupTimeoutRef.current);
        backupTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) setBackupMessage(null);
        }, 3000);
      }
    }
  }

  async function handleRestore(fileId: string) {
    if (!confirm("This will restore messages and photos from the backup. Current messages will be preserved. Proceed?")) return;
    
    setRestoreLoadingId(fileId);
    try {
      await performFullRestore(fileId);
      alert("Restore complete! Check your chat.");
    } catch (e: any) {
      alert("Restore failed: " + e.message);
    } finally {
      if (mountedRef.current) setRestoreLoadingId(null);
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (data && mountedRef.current) {
        setProfile(data);
        setDisplayName(data.display_name);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleTheme() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  async function handleSaveProfile() {
    if (!profile || !displayName.trim()) return;
    setSaving(true);
    await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() })
      .eq("id", profile.id);
    if (mountedRef.current) {
      setSaving(false);
      setSaved(true);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) setSaved(false);
      }, 2000);
    }
  }

  async function handleLogout() {
    await supabase.rpc("set_online_status", { online: false });
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function handleSaveE2ee() {
    if (e2eeSecret.trim()) {
      setStoredPassphrase(e2eeSecret.trim());
      setE2eeEnabled(true);
    }
  }

  function handleRemoveE2ee() {
    removeStoredPassphrase();
    setE2eeSecret("");
    setE2eeEnabled(false);
  }

  async function handleWallpaperUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setWallpaperUploading(true);
    try {
      await saveWallpaperToCache(file);
      await refreshWallpaper();
    } catch (err: any) {
      alert("Failed to save wallpaper: " + err.message);
    } finally {
      if (mountedRef.current) setWallpaperUploading(false);
    }
  }

  async function handleRemoveWallpaper() {
    if (!confirm("Remove custom wallpaper?")) return;
    await deleteWallpaperFromCache();
    await refreshWallpaper();
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center gap-3 border-b border-black/5 bg-card px-4 py-3">
        <Link href="/chat" className="rounded-full p-1.5 text-muted hover:bg-black/5" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-sm font-semibold text-ink">Settings</h1>
      </header>

      <div className="mx-auto max-w-md space-y-6 px-4 py-6">
        <section className="rounded-2xl border border-black/5 bg-card p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
            <User className="h-4 w-4" /> Profile
          </div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mb-3 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <label className="mb-1.5 block text-xs font-medium text-muted">Email</label>
          <input
            value={profile?.email ?? ""}
            disabled
            className="mb-4 w-full rounded-xl border border-black/10 bg-black/5 px-3 py-2 text-sm text-muted"
          />
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
          </button>
        </section>

        <section className="rounded-2xl border border-black/5 bg-card p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
            <Shield className="h-4 w-4" /> End-to-End Encryption
          </div>
          <p className="mb-3 text-xs text-muted">
            Enter a secret phrase that both you and your partner know. Messages will be encrypted before being sent and can only be read with the same phrase.
          </p>
          <input
            type="password"
            value={e2eeSecret}
            onChange={(e) => setE2eeSecret(e.target.value)}
            placeholder="Enter shared secret phrase…"
            className="mb-3 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveE2ee}
              disabled={!e2eeSecret.trim()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
            >
              {e2eeEnabled ? "Update Key" : "Enable E2EE"}
            </button>
            {e2eeEnabled && (
              <button
                onClick={handleRemoveE2ee}
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                Disable
              </button>
            )}
          </div>
          {e2eeEnabled && (
            <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent-dark">
              ✓ Encryption is active. Make sure your partner uses the same phrase.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-black/5 bg-card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Download className="h-4 w-4" /> Photos
          </div>
          <button
            onClick={() => {
              const next = !autoSavePhotos;
              setAutoSavePhotos(next);
              setAutoSavePreference(next);
            }}
            className="flex w-full items-center justify-between rounded-xl border border-black/10 px-4 py-2.5 text-sm text-ink hover:bg-black/5"
          >
            <span>Auto-save photos to device</span>
            <span
              className={`flex h-6 w-11 items-center rounded-full px-0.5 transition-colors ${
                autoSavePhotos ? "bg-primary" : "bg-black/15"
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  autoSavePhotos ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </span>
          </button>
          <p className="mt-2 text-xs text-muted">
            When enabled, received photos will be automatically downloaded to your device.
          </p>
        </section>

        <section className="rounded-2xl border border-black/5 bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Cloud className="h-4 w-4" /> Google Drive Backup
            </div>
          </div>
          
          <p className="mb-4 text-xs text-muted">
            Securely back up your messages and locally cached photos to a hidden folder in your Google Drive. 
            You can restore them on a new device.
          </p>

          {!googleLinked ? (
            <button
              onClick={handleLinkGoogle}
              className="flex w-full justify-center rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/80"
            >
              Link Google Account
            </button>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-green-100 bg-green-50 px-3 py-2">
                <span className="flex items-center gap-2 text-xs font-semibold text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> Google Account Linked
                </span>
                <button onClick={handleUnlinkGoogle} className="text-xs font-semibold text-red-600 hover:underline">
                  Unlink
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleBackup}
                  disabled={backupLoading}
                  className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
                >
                  {backupLoading ? "Backing up..." : "Back Up Now"}
                </button>
              </div>
              
              {backupMessage && (
                <p className="text-center text-xs font-medium text-ink">{backupMessage}</p>
              )}

              {backups.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted">
                    <span>Recent Backups</span>
                    <button onClick={refreshBackups} className="hover:text-ink">
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {backups.slice(0, 3).map((backup) => (
                      <div key={backup.id} className="flex items-center justify-between rounded-xl border border-black/5 bg-black/5 px-3 py-2">
                        <div>
                          <p className="text-xs font-medium text-ink">
                            {new Date(backup.createdTime).toLocaleDateString()} at {new Date(backup.createdTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          <p className="text-[10px] text-muted">
                            {(parseInt(backup.size) / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          onClick={() => handleRestore(backup.id)}
                          disabled={restoreLoadingId !== null}
                          className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-primary shadow-sm hover:bg-gray-50 disabled:opacity-50"
                        >
                          {restoreLoadingId === backup.id ? "Restoring..." : "Restore"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-black/5 bg-card p-5">
          <div className="mb-3 text-sm font-semibold text-ink">Appearance</div>
          <button
            onClick={toggleTheme}
            className="flex w-full items-center justify-between rounded-xl border border-black/10 px-4 py-2.5 text-sm text-ink hover:bg-black/5"
          >
            <span className="flex items-center gap-2">
              {darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {darkMode ? "Dark mode" : "Light mode"}
            </span>
            <span className="text-xs text-muted">Tap to toggle</span>
          </button>
        </section>

        <section className="rounded-2xl border border-black/5 bg-card p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
            <Palette className="h-4 w-4" /> Personalization
          </div>
          
          <label className="mb-2 block text-xs font-medium text-muted">Accent Color</label>
          <div className="mb-6 flex gap-3">
            {(Object.keys(THEME_COLORS) as ThemeColor[]).map((color) => (
              <button
                key={color}
                onClick={() => setThemeColor(color)}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-transform hover:scale-110 ${
                  themeColor === color ? "ring-2 ring-primary ring-offset-2" : ""
                }`}
                style={{ backgroundColor: THEME_COLORS[color].primary }}
                aria-label={`Select ${color} theme`}
              >
                {themeColor === color && <CheckCircle2 className="h-5 w-5 text-white" />}
              </button>
            ))}
          </div>

          <label className="mb-2 block text-xs font-medium text-muted">Chat Wallpaper</label>
          <div className="flex flex-col gap-3">
            {wallpaperUrl ? (
              <div className="relative overflow-hidden rounded-xl border border-black/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={wallpaperUrl} alt="Wallpaper preview" className="h-32 w-full object-cover" />
                <button
                  onClick={handleRemoveWallpaper}
                  className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white backdrop-blur hover:bg-red-500/80"
                  aria-label="Remove wallpaper"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-black/20 bg-black/5">
                <p className="text-xs text-muted">No custom wallpaper</p>
              </div>
            )}
            
            <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark">
              <ImageIcon className="h-4 w-4" /> 
              {wallpaperUploading ? "Saving..." : wallpaperUrl ? "Change Wallpaper" : "Upload Wallpaper"}
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleWallpaperUpload}
                disabled={wallpaperUploading}
              />
            </label>
          </div>
        </section>

        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100"
        >
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>
    </main>
  );
}
