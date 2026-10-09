"use client";

import { useActionState } from "react";
import { updateDisplayName } from "@/lib/cloud/actions";

export default function DisplayNameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(updateDisplayName, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        Name classmates see
        <input name="displayName" defaultValue={name} className="rounded border border-[#DCDCDC] px-3 py-2 outline-none" />
      </label>
      <button type="submit" disabled={pending} className="rounded border border-[#DCDCDC] px-3 py-2 text-sm">
        {pending ? "Saving…" : "Save"}
      </button>
      {state?.error && <p className="text-sm text-[#9B1C1C]">{state.error}</p>}
      {state?.notice && <p className="text-sm text-[#166534]">{state.notice}</p>}
    </form>
  );
}
