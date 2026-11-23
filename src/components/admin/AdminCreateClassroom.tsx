"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CLASSROOM_LANGUAGES } from "@/lib/classroom/languages";

export default function AdminCreateClassroom({ teacherId }: { teacherId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const response = await fetch("/api/classroom", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, teacherId }),
      });
      const data = await response.json();
      if (!response.ok || !data.classroom) throw Error(data.error || "Could not create the classroom.");
      router.push(`/classroom/${data.classroom.id}/manage`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create the classroom.");
    } finally {
      setBusy(false);
    }
  }
  const input = "mt-1 block w-full rounded border border-neutral-300 bg-white p-2 text-black";
  return <details className="mb-4 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
    <summary className="cursor-pointer font-medium">Create a class for this teacher</summary>
    <form onSubmit={create} className="mt-3 grid gap-3 sm:grid-cols-2">
      <label>Name<input className={input} name="name" required maxLength={100}/></label>
      <label>Subject<input className={input} name="subject" required maxLength={100}/></label>
      <label>Language<select className={input} name="language">{Object.entries(CLASSROOM_LANGUAGES).map(([code, value]) => <option key={code} value={code}>{value.label}</option>)}</select></label>
      <label className="sm:col-span-2">Description<textarea className={input} name="description" rows={3} maxLength={4000}/></label>
      <button disabled={busy} className="w-fit rounded bg-black px-3 py-2 text-white disabled:opacity-50">{busy ? "Creating…" : "Create classroom"}</button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </form>
  </details>;
}
