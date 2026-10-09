"use client";

import { useActionState } from "react";
import { createProject } from "@/lib/cloud/actions";

const STANDARDS = ["c++11", "c++14", "c++17", "c++20", "c++23"];

export default function CreateProjectForm({ groupId }: { groupId?: string }) {
  const [state, action, pending] = useActionState(createProject, null);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      {groupId && <input type="hidden" name="groupId" value={groupId} />}
      <label className="flex flex-1 flex-col gap-1 text-sm">
        Project name
        <input name="title" placeholder="Loops lab" className="rounded border border-[#DCDCDC] px-3 py-2 outline-none" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Standard
        <select name="standard" defaultValue="c++17" className="rounded border border-[#DCDCDC] px-3 py-2">
          {STANDARDS.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <button type="submit" disabled={pending} className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "Creating…" : "Create project"}
      </button>
      {state?.error && <p className="text-sm text-[#9B1C1C] sm:basis-full">{state.error}</p>}
    </form>
  );
}
