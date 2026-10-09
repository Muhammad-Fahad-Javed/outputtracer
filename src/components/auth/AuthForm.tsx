"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export default function AuthForm({
  mode,
  nextPath,
}: {
  mode: "login" | "signup";
  nextPath: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const supabase = await getSupabaseBrowser();
    if (!supabase) {
      setError("Accounts are not configured on this server yet.");
      setPending(false);
      return;
    }
    const origin = window.location.origin;
    if (mode === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: displayName.trim() },
          emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (signUpError) setError(signUpError.message);
      else if (data.session) router.push(nextPath);
      else setMessage("Check your email to confirm the account, then sign in.");
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) setError(signInError.message);
      else router.push(nextPath);
    }
    setPending(false);
  };

  const google = async () => {
    setError(null);
    const supabase = await getSupabaseBrowser();
    if (!supabase) {
      setError("Accounts are not configured on this server yet.");
      return;
    }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });
    if (oauthError) setError(oauthError.message);
  };

  const reset = async () => {
    setError(null);
    setMessage(null);
    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }
    const supabase = await getSupabaseBrowser();
    if (!supabase) return;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/projects`,
    });
    if (resetError) setError(resetError.message);
    else setMessage("Password reset email sent.");
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
      <Link href="/" className="text-[14px] font-semibold">OutputTracer</Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        {mode === "login" ? "Sign in" : "Create an account"}
      </h1>
      <p className="mt-2 text-sm text-[#666666]">
        Save projects, invite editors and viewers, and work in the same files at the same time.
      </p>
      <form onSubmit={(event) => void submit(event)} className="mt-8 space-y-3">
        {mode === "signup" && (
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Your name"
            required
            className="w-full rounded border border-[#DCDCDC] px-3 py-2 text-sm outline-none"
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          required
          className="w-full rounded border border-[#DCDCDC] px-3 py-2 text-sm outline-none"
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          required
          minLength={8}
          className="w-full rounded border border-[#DCDCDC] px-3 py-2 text-sm outline-none"
        />
        <button type="submit" disabled={pending} className="w-full rounded bg-black px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      <button type="button" onClick={() => void google()} className="mt-3 w-full rounded border border-[#DCDCDC] px-3 py-2 text-sm">
        Continue with Google
      </button>
      {mode === "login" && (
        <button type="button" onClick={() => void reset()} className="mt-3 text-left text-sm text-[#666666]">
          Email me a password reset
        </button>
      )}
      {error && <p className="mt-4 text-sm text-[#9B1C1C]">{error}</p>}
      {message && <p className="mt-4 text-sm text-[#166534]">{message}</p>}
      <p className="mt-8 text-sm text-[#666666]">
        {mode === "login" ? (
          <Link href={`/signup?next=${encodeURIComponent(nextPath)}`} className="text-black underline">Create an account</Link>
        ) : (
          <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="text-black underline">Already have an account</Link>
        )}
      </p>
    </main>
  );
}
