"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, User, Heart } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import Link from "next/link";

function SignupForm() {
  const router = useRouter();
  const supabase = createClient();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: displayName }
      }
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    router.replace("/pair");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Heart className="h-7 w-7 text-primary" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-semibold text-ink">Create Your Space</h1>
          <p className="mt-1 text-sm text-muted">A private room just for you and your partner.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-black/5 bg-card p-6 shadow-sm"
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="displayName" className="mb-1.5 block text-sm font-medium text-ink">
                Display Name
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  id="displayName"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-10 pr-3 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

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
                  autoComplete="new-password"
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

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Creating account…
                </span>
              ) : (
                "Create Account"
              )}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary hover:text-primary-dark">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

function SignupFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupFallback />}>
      <SignupForm />
    </Suspense>
  );
}
