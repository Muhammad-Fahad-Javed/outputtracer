"use client";

import { useActionState } from "react";
import { createGroup } from "@/lib/cloud/actions";

export default function CreateGroupForm() {
  const [state, action, pending] = useActionState(createGroup, null);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row">
      <input name="name" required placeholder="Section A" className="flex-1 rounded border border-[#DCDCDC] px-3 py-2 text-sm outline-none" />
      <button type="submit" disabled={pending} className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "Creating…" : "Create group"}
      </button>
      {state?.error && <p className="text-sm text-[#9B1C1C] sm:basis-full">{state.error}</p>}
    </form>
  );
}
