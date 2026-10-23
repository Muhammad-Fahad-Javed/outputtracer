import { describe, expect, it, vi } from "vitest";

const { snapshots } = vi.hoisted(() => ({ snapshots: [
  { id: "old", submission_id: "submission", version_id: "v1", assignment_id: "assignment", frozen_code_files: { "main.py": "print(1)" }, content_hash: "old-hash", submitted_at: "2026-10-22T00:00:00Z", is_late: false },
  { id: "new", submission_id: "submission", version_id: "v2", assignment_id: "assignment", frozen_code_files: { "main.py": "print(2)" }, content_hash: "new-hash", submitted_at: "2026-10-23T00:00:00Z", is_late: false },
] }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => {
  let rows = [...snapshots];
  const query = {
    select: () => query,
    eq: () => query,
    order: (column: "submitted_at" | "id", opts: { ascending: boolean }) => {
      if (column === "submitted_at") rows.sort((a, b) => opts.ascending ? a.submitted_at.localeCompare(b.submitted_at) : b.submitted_at.localeCompare(a.submitted_at));
      return query;
    },
    limit: (count: number) => { rows = rows.slice(0, count); return query; },
    maybeSingle: async () => rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "Multiple rows" } },
  };
  return query;
} }) }));
import { getSubmissionSnapshot } from "./versioningService";

describe("resubmission snapshots", () => {
  it("retrieves the newest hand-in when immutable older snapshots exist", async () => {
    const result = await getSubmissionSnapshot("submission");
    expect(result).toMatchObject({ id: "new", versionId: "v2", frozenCodeFiles: { "main.py": "print(2)" } });
    expect(snapshots[0].frozen_code_files).toEqual({ "main.py": "print(1)" });
    expect(snapshots).toHaveLength(2);
  });
});
