"use client";

import { FormEvent, useState, useRef } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

/** Returns the canonical site origin to use for auth redirect URLs.
 *
 * This component is "use client", so it only runs in the browser.
 * window.location.origin is always correct:
 *  - Production: https://outputtracer.com
 *  - Local dev:  http://localhost:3000
 *
 * We deliberately do NOT read NEXT_PUBLIC_SITE_URL here.  NEXT_PUBLIC_*
 * variables are inlined at build time; if the value was ever "localhost"
 * during a build it would be permanently baked into the JS bundle and
 * sent as the OAuth redirectTo even on the live server.
 */
function siteOrigin(): string {
  return window.location.origin;
}

function continueHref(role: string | undefined, nextPath: string): string {
  const params = new URLSearchParams();
  params.set("role", role || "learner");
  if (nextPath) params.set("next", nextPath);
  return `/auth/continue?${params.toString()}`;
}

/** Minimal Google "G" SVG mark — matches the official brand guidelines. */
function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <path
        d="M17.64 9.2045c0-.638-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087C16.6582 14.2527 17.64 11.9455 17.64 9.2045z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.4673-.8064 5.9564-2.1805l-2.9087-2.2581c-.8064.54-1.8382.8591-3.0477.8591-2.3446 0-4.3309-1.5846-5.0386-3.7132H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.9614 10.71c-.18-.54-.2827-1.1168-.2827-1.71s.1027-1.17.2827-1.71V4.9582H.9574C.3477 6.173 0 7.5482 0 9s.3477 2.8268.9574 4.0418L3.9614 10.71z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.5768c1.3214 0 2.5077.4541 3.4405 1.346l2.5818-2.5818C13.4627.8918 11.4255 0 9 0 5.4818 0 2.4382 2.0168.9574 4.9582l3.004 2.3318C4.6691 5.1614 6.6554 3.5768 9 3.5768z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function AuthForm({
  mode,
  nextPath,
  initialError = null,
  role,
}: {
  mode: "login" | "signup";
  nextPath: string;
  initialError?: string | null;
  role?: "learner" | "teacher" | "admin";
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  // Cloudflare Turnstile state
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const anyPending = pending || googlePending;

  const resetTurnstile = () => {
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (anyPending) return;

    if (!turnstileSiteKey) {
      setError("Security verification is not configured on this server. Please contact support.");
      return;
    }

    if (!captchaToken) {
      setError("Please complete the security check before continuing.");
      return;
    }

    setPending(true);
    setError(null);
    setMessage(null);
    const supabase = await getSupabaseBrowser();
    if (!supabase) {
      setError("Accounts are not configured on this server yet.");
      setPending(false);
      resetTurnstile();
      return;
    }
    const origin = siteOrigin();
    const tokenToUse = captchaToken;
    // Consume token immediately to prevent reuse
    resetTurnstile();

    if (mode === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: displayName.trim() },
          emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(continueHref(role, nextPath))}`,
          captchaToken: tokenToUse,
        },
      });
      if (signUpError) {
        setError(signUpError.message);
      } else if (data.session) {
        window.location.assign(continueHref(role, nextPath));
      } else {
        // Supabase also returns success for an existing confirmed account to
        // prevent account enumeration. This response is not proof of email delivery.
        setMessage(
          "If your email needs confirmation, check your inbox and spam folder for a link. Already registered? Sign in with your existing password, or use Continue with Google if you registered with Google."
        );
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: {
          captchaToken: tokenToUse,
        },
      });
      if (signInError) {
        setError(signInError.message);
      } else {
        window.location.assign(continueHref(role, nextPath));
      }
    }
    setPending(false);
  };

  const google = async () => {
    if (anyPending) return;
    setGooglePending(true);
    setError(null);
    const supabase = await getSupabaseBrowser();
    if (!supabase) {
      setError("Accounts are not configured on this server yet.");
      setGooglePending(false);
      return;
    }
    // signInWithOAuth redirects the browser; if it errors we restore the button.
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteOrigin()}/auth/callback?next=${encodeURIComponent(continueHref(role, nextPath))}`,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setGooglePending(false);
    }
    // On success the browser navigates away — no need to reset state.
  };

  const reset = async () => {
    if (anyPending) return;
    setError(null);
    setMessage(null);
    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }

    if (!turnstileSiteKey) {
      setError("Security verification is not configured on this server. Please contact support.");
      return;
    }

    if (!captchaToken) {
      setError("Please complete the security check before requesting a password reset.");
      return;
    }

    const tokenToUse = captchaToken;
    resetTurnstile();

    const supabase = await getSupabaseBrowser();
    if (!supabase) {
      setError("Accounts are not configured on this server yet.");
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${siteOrigin()}/auth/callback?next=${encodeURIComponent(continueHref(role, ""))}`,
        captchaToken: tokenToUse,
      }
    );
    if (resetError) setError(resetError.message);
    else setMessage("Password reset email sent — check your inbox.");
  };

  const roleMeta: Record<string, { label: string; desc: string; color: string }> = {
    learner: {
      label: "Learner / Student",
      desc: "Learn programming, join classrooms, track progress, and build projects.",
      color: "bg-blue-50 text-blue-700 border-blue-200",
    },
    teacher: {
      label: "Teacher / Educator",
      desc: "Teach students, manage classrooms, create assignments, and review submissions.",
      color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    admin: {
      label: "Administrator",
      desc: "Manage users, verify educators, administer courses, and oversee the platform.",
      color: "bg-amber-50 text-amber-700 border-amber-200",
    },
  };

  const rm = role ? roleMeta[role] : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-white px-5 py-16 text-black">
      <Link href="/" className="text-[14px] font-semibold">
        OutputTracer
      </Link>

      {/* ── Role badge ── */}
      {rm && (
        <div className={`mt-6 inline-flex items-center gap-2 self-start rounded-full border px-3 py-1 text-xs font-semibold ${rm.color}`}>
          {rm.label}
        </div>
      )}

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {mode === "login" ? "Sign in" : "Create an account"}
      </h1>
      <p className="mt-2 text-sm text-[#666666]">
        {rm ? rm.desc : "Save projects, invite editors and viewers, and work in the same files at the same time."}
      </p>

      {/* ── Google OAuth ── */}
      <button
        type="button"
        onClick={() => void google()}
        disabled={anyPending}
        className="mt-8 flex w-full items-center justify-center gap-2.5 rounded border border-[#DCDCDC] px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-[#F8F8F8] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {googlePending ? (
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#DCDCDC] border-t-black"
          />
        ) : (
          <GoogleIcon />
        )}
        {googlePending ? "Redirecting…" : "Continue with Google"}
      </button>

      {/* ── Divider ── */}
      <div className="mt-5 flex items-center gap-3">
        <hr className="flex-1 border-[#DCDCDC]" />
        <span className="text-xs text-[#999999]">or</span>
        <hr className="flex-1 border-[#DCDCDC]" />
      </div>

      {/* ── Email / password form ── */}
      <form
        onSubmit={(event) => void submit(event)}
        className="mt-5 space-y-3"
      >
        {mode === "signup" && (
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Your name"
            required
            disabled={anyPending}
            className="w-full rounded border border-[#DCDCDC] px-3 py-2 text-sm outline-none disabled:opacity-60"
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          required
          disabled={anyPending}
          className="w-full rounded border border-[#DCDCDC] px-3 py-2 text-sm outline-none disabled:opacity-60"
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          required
          minLength={8}
          disabled={anyPending}
          className="w-full rounded border border-[#DCDCDC] px-3 py-2 text-sm outline-none disabled:opacity-60"
        />

        {/* ── Turnstile CAPTCHA Widget ── */}
        {turnstileSiteKey ? (
          <div className="flex min-h-[65px] w-full items-center justify-center overflow-hidden py-1">
            <Turnstile
              ref={turnstileRef}
              siteKey={turnstileSiteKey}
              onSuccess={(token) => {
                setCaptchaToken(token);
                setError(null);
              }}
              onExpire={() => {
                setCaptchaToken(null);
              }}
              onError={() => {
                setCaptchaToken(null);
                setError("Security verification failed. Please try again.");
              }}
              options={{
                theme: "light",
                size: "normal",
              }}
            />
          </div>
        ) : (
          <div className="rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            Security verification site key is not configured.
          </div>
        )}

        <button
          type="submit"
          disabled={anyPending || !captchaToken}
          className="w-full rounded bg-black px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      {mode === "login" && (
        <button
          type="button"
          onClick={() => void reset()}
          disabled={anyPending}
          className="mt-3 text-left text-sm text-[#666666] disabled:opacity-60"
        >
          Email me a password reset
        </button>
      )}

      {error && <p className="mt-4 text-sm text-[#9B1C1C]">{error}</p>}
      {message && <p className="mt-4 text-sm text-[#166534]">{message}</p>}

      <div className="mt-8 flex flex-col gap-2 text-sm text-[#666666]">
        {mode === "login" ? (
          <Link
            href={`/signup?${role ? `role=${role}&` : ""}next=${encodeURIComponent(nextPath)}`}
            className="text-black underline"
          >
            Create an account
          </Link>
        ) : (
          <Link
            href={`/login?${role ? `role=${role}&` : ""}next=${encodeURIComponent(nextPath)}`}
            className="text-black underline"
          >
            Already have an account
          </Link>
        )}
        {role && (
          <Link
            href="/login"
            className="text-[#666666] hover:text-black text-xs"
          >
            ← Switch to a different role
          </Link>
        )}
      </div>
    </main>
  );
}

