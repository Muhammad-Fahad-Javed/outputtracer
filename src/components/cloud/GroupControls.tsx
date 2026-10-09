"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { deleteGroup, inviteToGroup, removeGroupMember, renameGroup } from "@/lib/cloud/actions";

export function InviteGroupForm({ groupId }: { groupId: string }) {
  const [state, action, pending] = useActionState(inviteToGroup, null);
  return (
    <form action={action} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="groupId" value={groupId} />
      <input name="email" type="email" required placeholder="student@school.edu" className="flex-1 rounded border border-[#DCDCDC] px-3 py-2 text-sm outline-none" />
      <button type="submit" disabled={pending} className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "Adding…" : "Add member"}
      </button>
      {state?.error && <p className="text-sm text-[#9B1C1C] sm:basis-full">{state.error}</p>}
      {state?.notice && <p className="text-sm text-[#166534] sm:basis-full">{state.notice}</p>}
    </form>
  );
}

export function RemoveMemberButton({ groupId, userId }: { groupId: string; userId: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-sm text-[#9B1C1C]"
      onClick={() => {
        void removeGroupMember(groupId, userId).then(() => router.refresh());
      }}
    >
      Remove
    </button>
  );
}

export function RenameGroupButton({ groupId, name }: { groupId: string; name: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="rounded border border-[#DCDCDC] px-3 py-1.5 text-sm"
      onClick={() => {
        const next = window.prompt("Group name", name);
        if (!next) return;
        void renameGroup(groupId, next).then(() => router.refresh());
      }}
    >
      Rename
    </button>
  );
}

export function DeleteGroupButton({ groupId }: { groupId: string }) {
  return (
    <button
      type="button"
      className="rounded border border-[#F3C1C1] px-3 py-1.5 text-sm text-[#9B1C1C]"
      onClick={() => {
        if (!window.confirm("Delete this group? Projects stay, but they leave the group.")) {
          return;
        }
        void deleteGroup(groupId);
      }}
    >
      Delete group
    </button>
  );
}
