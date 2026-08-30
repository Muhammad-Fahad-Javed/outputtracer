"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (signInError) {
      // Deliberately vague: never confirm/deny whether an email exists.
      setError("Incorrect email or password.");
      return;
    }

    const redirectedFrom = searchParams.get("redirectedFrom");
    let target = redirectedFrom || "/chat";
    if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) {
      target = "/chat";
    }
    router.replace(target);
    router.refresh();
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError("Enter your email above first, then tap “Forgot password?”");
      return;
    }
    setError(null);
    setLoading(true);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${siteUrl}/auth/callback?next=/settings`,
    });
    setLoading(false);
    // Same message regardless of outcome — don't leak whether the email exists.
    setResetSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <ShieldCheck className="h-7 w-7 text-primary" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-semibold text-ink">Private Space</h1>
          <p className="mt-1 text-sm text-muted">Welcome back to your private space.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-black/5 bg-card p-6 shadow-sm"
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-10 pr-3 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-10 pr-10 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            {resetSent && (
              <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
                If that email is registered, a reset link is on its way.
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Signing in…
                </span>
              ) : (
                "Log in"
              )}
            </button>

            <button
              type="button"
              onClick={handleForgotPassword}
              className="w-full text-center text-xs font-medium text-muted hover:text-primary"
            >
              Forgot password?
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-primary hover:text-primary-dark">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}

function LoginFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams() requires a Suspense boundary during static generation.
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
