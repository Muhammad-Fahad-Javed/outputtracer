"use client";

import { useState, type FormEvent } from "react";
import type { Classroom } from "@/lib/classroom/types";

export default function ClassroomDetailsForm({ classroom, onSave }: { classroom: Classroom; onSave: (classroom: Classroom) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const response = await fetch(`/api/classroom/${classroom.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok || !result.classroom) throw Error(result.error || "Could not save classroom details.");
      onSave(result.classroom);
      setMessage("Classroom details saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save classroom details.");
    } finally {
      setBusy(false);
    }
  }
  const field = "mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-black";
  return (
    <details className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-black">
      <summary className="cursor-pointer font-medium">Edit classroom details</summary>
      <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>Classroom name<input className={field} name="name" required maxLength={100} defaultValue={classroom.name} /></label>
        <label>Subject<input className={field} name="subject" required maxLength={100} defaultValue={classroom.subject} /></label>
        <label className="sm:col-span-2">Description<textarea className={field} name="description" rows={3} maxLength={4000} defaultValue={classroom.description} /></label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button disabled={busy} className="rounded bg-black px-3 py-2 text-white disabled:opacity-50">{busy ? "Saving…" : "Save classroom details"}</button>
          <p role="status">{message}</p>
        </div>
      </form>
    </details>
  );
}
