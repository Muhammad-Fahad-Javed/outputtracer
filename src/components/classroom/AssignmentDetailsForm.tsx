"use client";

import { useState, type FormEvent } from "react";
import type { ClassroomAssignment } from "@/lib/classroom/types";

function localDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";
}

export default function AssignmentDetailsForm({ classId, assignment, onChange }: {
  classId: string;
  assignment: ClassroomAssignment;
  onChange: (assignment: ClassroomAssignment) => void;
}) {
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const due = String(form.get("dueDate") || "");
      const response = await fetch(`/api/classroom/${classId}/assignments/${assignment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          description: form.get("description"),
          dueDate: due ? new Date(due).toISOString() : null,
          isPublished: form.get("isPublished") === "on",
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.assignment) throw Error(data.error || "Could not save assignment details.");
      onChange(data.assignment);
      setMessage("Assignment details saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save assignment details.");
    } finally {
      setSaving(false);
    }
  }
  const input = "mt-1 block w-full rounded border border-[#555] bg-[#181818] p-2 text-white";
  return (
    <details className="rounded border border-[#444] p-3">
      <summary className="cursor-pointer font-semibold">Edit assignment details</summary>
      <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>Title<input className={input} name="title" required maxLength={160} defaultValue={assignment.title} /></label>
        <label>Due date and time<input className={input} type="datetime-local" name="dueDate" defaultValue={localDateTime(assignment.dueDate)} /></label>
        <label className="sm:col-span-2">Instructions<textarea className={input} name="description" rows={4} maxLength={20000} defaultValue={assignment.description} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" name="isPublished" defaultChecked={assignment.isPublished} /> Published to students</label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button disabled={saving} className="rounded bg-[#0e639c] px-3 py-2 text-white disabled:opacity-50">{saving ? "Saving…" : "Save assignment details"}</button>
          <p role="status">{message}</p>
        </div>
      </form>
    </details>
  );
}
