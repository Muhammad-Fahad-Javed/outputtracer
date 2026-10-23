"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function TeacherActivationPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function activate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/classroom/teacher/apply", { method: "POST" });
      if (response.status === 401) {
        router.push("/login/teacher?next=/classroom/teach/apply");
        return;
      }
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Activation failed.");
      router.push("/auth/continue?role=teacher");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not activate teacher profile.");
      setBusy(false);
    }
  }
  return <><Header /><main className="mx-auto max-w-2xl px-6 py-16">
    <h1 className="text-3xl font-semibold">Activate your Teacher profile</h1>
    <p className="mt-4 text-gray-600">Create classrooms, assign work, and give students feedback. Registered users can activate a Teacher profile without an application or approval.</p>
    <p className="mt-3 text-sm text-gray-600">Your learner profile stays available. Existing access restrictions must be resolved by an administrator.</p>
    {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
    <button disabled={busy} onClick={activate} className="mt-6 rounded bg-black px-5 py-3 text-white disabled:opacity-50">{busy ? "Activating…" : "Activate Teacher profile"}</button>
    <Link href="/classroom/student" className="ml-4 underline">Back to learning</Link>
  </main><Footer /></>;
}
