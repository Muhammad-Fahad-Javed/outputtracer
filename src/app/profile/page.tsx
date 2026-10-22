"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/components/AuthProvider";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import {
  User,
  Mail,
  Camera,
  Trash2,
  Lock,
  ShieldCheck,
  GraduationCap,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Phone,
  MapPin,
  Globe,
  Code2,
} from "lucide-react";

interface ProfileData {
  id: string;
  email: string;
  displayName: string;
  fullName: string;
  username: string | null;
  avatarUrl: string | null;
  phone: string;
  bio: string;
  country: string;
  city: string;
  preferredLanguages: string[];
  createdAt: string;
  updatedAt: string;
  roles: string[];
  isVerifiedTeacher: boolean;
  isAdmin: boolean;
  teacherApplicationStatus: string;
}

const AVAILABLE_LANGUAGES = [
  { id: "cpp", name: "C++ (11/17/20)" },
  { id: "asm8086", name: "8086 Assembly" },
  { id: "python", name: "Python" },
  { id: "javascript", name: "JavaScript" },
  { id: "typescript", name: "TypeScript" },
  { id: "rust", name: "Rust" },
];

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading: authLoading, signOut } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Fields
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(["cpp"]);

  // Password Update State
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Delete Account State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationPhrase, setDeleteConfirmationPhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?next=/profile");
      return;
    }

    if (user) {
      let active = true;
      const fetchProfile = async () => {
        try {
          const res = await fetch("/api/profile");
          if (!active) return;
          if (res.status === 401) {
            router.push("/login?next=/profile");
            return;
          }
          const data = await res.json();
          if (data.success && data.profile && active) {
            const p: ProfileData = data.profile;
            setProfile(p);
            setFullName(p.fullName || "");
            setDisplayName(p.displayName || "");
            setUsername(p.username || "");
            setPhone(p.phone || "");
            setBio(p.bio || "");
            setCountry(p.country || "");
            setCity(p.city || "");
            setSelectedLanguages(p.preferredLanguages || ["cpp"]);
          }
        } catch {
          if (active) setErrorMsg("Failed to load profile data.");
        } finally {
          if (active) setLoading(false);
        }
      };

      void fetchProfile();
      return () => {
        active = false;
      };
    }
  }, [user, authLoading, router]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          displayName,
          username: username || undefined,
          phone,
          bio,
          country,
          city,
          preferredLanguages: selectedLanguages,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to update profile.");
      } else {
        setProfile(data.profile);
        setSuccessMsg("Profile updated successfully.");
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch {
      setErrorMsg("A network error occurred while updating profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg("Image file must be under 2MB.");
      return;
    }

    setUploadingAvatar(true);
    setErrorMsg(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to upload avatar.");
      } else {
        if (profile) {
          setProfile({ ...profile, avatarUrl: data.avatarUrl });
        }
        setSuccessMsg("Avatar uploaded successfully.");
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch {
      setErrorMsg("Network error uploading avatar.");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    if (!confirm("Are you sure you want to remove your profile photo?")) return;
    setUploadingAvatar(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      const data = await res.json();
      if (data.success && profile) {
        setProfile({ ...profile, avatarUrl: null });
        setSuccessMsg("Profile photo removed.");
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch {
      setErrorMsg("Failed to remove avatar.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setPasswordStatus("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus("Passwords do not match.");
      return;
    }

    setPasswordLoading(true);
    setPasswordStatus(null);

    try {
      const supabase = await getSupabaseBrowser();
      if (!supabase) {
        setPasswordStatus("Authentication service unavailable.");
        setPasswordLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordStatus(error.message);
      } else {
        setPasswordStatus("Password changed successfully.");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPasswordStatus("Unexpected error updating password.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch("/api/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationPhrase: deleteConfirmationPhrase }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeleteError(data.error || "Failed deleting account.");
        setDeleting(false);
      } else {
        await signOut();
        router.push("/?deleted=true");
      }
    } catch {
      setDeleteError("Network error deleting account.");
      setDeleting(false);
    }
  };

  const toggleLanguage = (langId: string) => {
    setSelectedLanguages((prev) =>
      prev.includes(langId) ? prev.filter((id) => id !== langId) : [...prev, langId]
    );
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen flex-col bg-[#FAFAFA]">
        <Header />
        <main className="flex flex-1 items-center justify-center p-8">
          <div className="rounded-xl border border-[#EAEAEA] bg-white p-10 text-center text-xs text-[#666666]">
            Loading profile information...
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const initials = (profile?.fullName || profile?.displayName || profile?.email || "U")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA]">
      <Header />

      <main className="flex-1 py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Top Header Card */}
          <div className="rounded-2xl border border-[#EAEAEA] bg-white p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div className="flex items-center gap-5">
                {/* Avatar Display & Uploader */}
                <div className="relative group shrink-0">
                  <div className="h-20 w-20 rounded-full border border-[#DCDCDC] overflow-hidden bg-[#F2F2F2] flex items-center justify-center text-xl font-bold text-[#444444]">
                    {profile?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.avatarUrl}
                        alt="Profile avatar"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
                    title="Change Avatar"
                  >
                    <Camera size={20} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </div>

                <div>
                  <h1 className="text-xl font-bold tracking-tight text-black flex items-center gap-2">
                    {profile?.fullName || profile?.displayName || "My Profile"}
                  </h1>
                  <p className="text-xs text-[#666666] flex items-center gap-1.5 mt-0.5">
                    <Mail size={12} /> {profile?.email}
                  </p>

                  {/* Verified Role Badges */}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {profile?.isAdmin && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                        <ShieldCheck size={12} /> Platform Administrator
                      </span>
                    )}
                    {profile?.isVerifiedTeacher && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                        <GraduationCap size={12} /> Verified Educator
                      </span>
                    )}
                    {!profile?.isAdmin && !profile?.isVerifiedTeacher && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800">
                        <BookOpen size={12} /> Student / Learner
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Actions / Destination Navigation */}
              <div className="flex flex-col sm:items-end gap-2 shrink-0">
                {profile?.isAdmin && (
                  <Link
                    href="/admin"
                    className="inline-flex items-center justify-center gap-1.5 rounded-[4px] bg-black px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#333333]"
                  >
                    Admin Control Center <ArrowRight size={13} />
                  </Link>
                )}
                {profile?.isVerifiedTeacher && (
                  <Link
                    href="/auth/continue?role=teacher"
                    className="inline-flex items-center justify-center gap-1.5 rounded-[4px] bg-black px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#333333]"
                  >
                    Teacher Studio <ArrowRight size={13} />
                  </Link>
                )}
                <Link
                  href="/classroom/student"
                  className="inline-flex items-center justify-center gap-1.5 rounded-[4px] border border-[#DCDCDC] bg-white px-3.5 py-2 text-xs font-medium text-black hover:bg-[#F2F2F2]"
                >
                  Student Dashboard <ArrowRight size={13} />
                </Link>
                {profile?.avatarUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={uploadingAvatar}
                    className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-700 mt-1"
                  >
                    <Trash2 size={11} /> Remove photo
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Feedback alerts */}
          {successMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 size={15} /> {successMsg}
            </div>
          )}
          {errorMsg && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle size={15} /> {errorMsg}
            </div>
          )}

          {/* Profile Details Form */}
          <form onSubmit={handleSaveProfile} className="rounded-2xl border border-[#EAEAEA] bg-white p-6 sm:p-8 shadow-xs space-y-6">
            <div>
              <h2 className="text-sm font-bold text-black tracking-tight flex items-center gap-2">
                <User size={15} /> Personal Details
              </h2>
              <p className="text-xs text-[#666666] mt-0.5">
                Manage your name, username, bio, and programming preferences across all roles.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  maxLength={100}
                  className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Alex"
                  maxLength={60}
                  className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Username (optional)
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="e.g. alex_coder"
                  maxLength={30}
                  className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black font-mono"
                />
                <span className="text-[10px] text-[#888888] mt-1 block">
                  Lowercase letters, numbers, hyphens, and underscores only.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  <Phone size={12} className="inline mr-1" /> Phone Number (optional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  maxLength={30}
                  className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  <Globe size={12} className="inline mr-1" /> Country
                </label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="e.g. United States"
                  maxLength={80}
                  className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  <MapPin size={12} className="inline mr-1" /> City
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. San Francisco"
                  maxLength={80}
                  className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-black mb-1">
                Short Biography
              </label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Share a brief introduction about your programming interests or teaching focus..."
                maxLength={500}
                className="w-full rounded-md border border-[#DCDCDC] p-3 text-xs outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-black mb-1.5 flex items-center gap-1.5">
                <Code2 size={13} /> Preferred Programming Languages & Topics
              </label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_LANGUAGES.map((lang) => {
                  const selected = selectedLanguages.includes(lang.id);
                  return (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => toggleLanguage(lang.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                        selected
                          ? "bg-black text-white border-black"
                          : "bg-white text-black border-[#DCDCDC] hover:bg-[#F2F2F2]"
                      }`}
                    >
                      {lang.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 rounded-[4px] bg-black px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#333333] disabled:opacity-50"
              >
                <Sparkles size={13} /> {saving ? "Saving Changes..." : "Save Profile Details"}
              </button>
            </div>
          </form>

          {/* Account Security Card */}
          <div className="rounded-2xl border border-[#EAEAEA] bg-white p-6 sm:p-8 shadow-xs space-y-6">
            <div>
              <h2 className="text-sm font-bold text-black tracking-tight flex items-center gap-2">
                <Lock size={15} /> Security & Password
              </h2>
              <p className="text-xs text-[#666666] mt-0.5">
                Update your authentication credentials securely.
              </p>
            </div>

            {passwordStatus && (
              <div
                className={`rounded-md p-3 text-xs ${
                  passwordStatus.includes("success")
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                {passwordStatus}
              </div>
            )}

            <form onSubmit={handlePasswordUpdate} className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black"
                />
              </div>

              <button
                type="submit"
                disabled={passwordLoading}
                className="inline-flex items-center justify-center rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-[#333333] disabled:opacity-50"
              >
                {passwordLoading ? "Updating..." : "Update Password"}
              </button>
            </form>
          </div>

          {/* Danger Zone: Account Deletion */}
          <div className="rounded-2xl border border-rose-200 bg-white p-6 sm:p-8 shadow-xs">
            <h2 className="text-sm font-bold text-rose-600 tracking-tight flex items-center gap-2">
              <Trash2 size={15} /> Danger Zone: Delete Account
            </h2>
            <p className="text-xs text-[#666666] mt-1 leading-relaxed">
              Permanently delete your account, saved snippets, project files, and personal data. This action is irreversible.
            </p>

            <div className="mt-4">
              {!showDeleteModal ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="rounded-[4px] border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
                >
                  Delete Account
                </button>
              ) : (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/50 p-4 space-y-3 max-w-lg">
                  <p className="text-xs text-rose-900 font-medium">
                    Type <strong>DELETE MY ACCOUNT</strong> in capital letters to confirm permanent account removal:
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmationPhrase}
                    onChange={(e) => setDeleteConfirmationPhrase(e.target.value)}
                    placeholder="DELETE MY ACCOUNT"
                    className="w-full rounded-md border border-rose-300 bg-white px-3 py-2 text-xs outline-none focus:border-rose-600 font-mono"
                  />
                  {deleteError && (
                    <p className="text-xs text-rose-700">{deleteError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={deleting || deleteConfirmationPhrase !== "DELETE MY ACCOUNT"}
                      onClick={handleDeleteAccount}
                      className="rounded-[4px] bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
                    >
                      {deleting ? "Deleting..." : "Permanently Delete Account"}
                    </button>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => setShowDeleteModal(false)}
                      className="rounded-[4px] border border-[#DCDCDC] bg-white px-3 py-2 text-xs font-medium text-black hover:bg-[#F2F2F2]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
