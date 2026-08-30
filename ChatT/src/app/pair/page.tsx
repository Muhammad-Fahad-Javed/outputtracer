"use client";

import { useEffect, useState, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Link2, KeyRound, ArrowRight, Loader2, Copy, Check } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

export default function PairPage() {
  const router = useRouter();
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<"generate" | "enter">("generate");
  const [code, setCode] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    async function checkExisting() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setUserId(user.id);

      const { data: conversation } = await supabase
        .from("conversations")
        .select("id")
        .or(`user_1_id.eq.${user.id},user_2_id.eq.${user.id}`)
        .maybeSingle();

      if (conversation) {
        router.replace("/chat");
      } else {
        setChecking(false);
      }
    }
    checkExisting();
  }, [router, supabase]);

  // Realtime subscription so the code generator automatically navigates when paired
  useEffect(() => {
    if (!userId) return;
    
    const channel = supabase.channel(`pairing-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversations",
          // The filter string only supports simple equality, so we listen to all inserts and check inside
        },
        (payload) => {
          const newConv = payload.new as { user_1_id: string, user_2_id: string };
          if (newConv.user_1_id === userId || newConv.user_2_id === userId) {
            router.replace("/chat");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router, supabase]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newCode = String(Math.floor(100000 + Math.random() * 900000));
    
    // expires in 24 hours
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const { error: insertError } = await supabase
      .from("connection_codes")
      .insert({
        code: newCode,
        user_id: user.id,
        expires_at: expiresAt.toISOString(),
      });

    setLoading(false);

    if (insertError) {
      setError("Failed to generate code.");
      return;
    }

    setCode(newCode);
  }

  async function handleConnect(e: FormEvent) {
    e.preventDefault();
    if (inputCode.length !== 6) {
      setError("Code must be 6 digits.");
      return;
    }

    setLoading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // find code
    const { data: codeData, error: codeError } = await supabase
      .from("connection_codes")
      .select("id, user_id")
      .eq("code", inputCode)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (codeError || !codeData) {
      setLoading(false);
      setError("Invalid or expired code.");
      return;
    }

    if (codeData.user_id === user.id) {
      setLoading(false);
      setError("You cannot connect with your own code.");
      return;
    }

    // Insert conversation
    const { error: convError } = await supabase
      .from("conversations")
      .insert({
        user_1_id: codeData.user_id,
        user_2_id: user.id
      });

    if (convError) {
      setLoading(false);
      setError("Failed to create conversation.");
      return;
    }

    // Mark code as used
    await supabase
      .from("connection_codes")
      .update({ used: true })
      .eq("id", codeData.id);

    router.replace("/chat");
    router.refresh();
  }

  function handleCopy() {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Link2 className="h-7 w-7 text-primary" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-semibold text-ink">Connect with your partner</h1>
          <p className="mt-1 text-sm text-muted">Generate a code or enter one to pair up.</p>
        </div>

        <div className="rounded-2xl border border-black/5 bg-card p-6 shadow-sm">
          <div className="mb-6 flex rounded-xl bg-black/5 p-1">
            <button
              onClick={() => { setActiveTab("generate"); setError(null); }}
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${
                activeTab === "generate" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              Generate Code
            </button>
            <button
              onClick={() => { setActiveTab("enter"); setError(null); }}
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${
                activeTab === "enter" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              Enter Code
            </button>
          </div>

          {activeTab === "generate" ? (
            <div className="space-y-4 text-center">
              {code ? (
                <div className="space-y-4">
                  <div className="rounded-xl bg-black/5 py-6">
                    <span className="font-mono text-4xl tracking-[0.2em] text-ink">{code}</span>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-black/10 bg-white py-2.5 text-sm font-medium text-ink transition hover:bg-black/5"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied!" : "Copy Code"}
                  </button>
                  <p className="text-xs text-muted">This code expires in 24 hours</p>
                </div>
              ) : (
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="flex w-full items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Generate Connection Code"
                  )}
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleConnect} className="space-y-4">
              <div>
                <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-ink">
                  Partner&apos;s Code
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    id="code"
                    type="text"
                    required
                    maxLength={6}
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-10 pr-3 text-center font-mono text-lg tracking-widest text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              
              <button
                type="submit"
                disabled={loading || inputCode.length !== 6}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Connect <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
