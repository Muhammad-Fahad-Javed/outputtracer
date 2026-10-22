import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const root = path.join(process.cwd(), "supabase", "migrations");

describe("privilege migrations (not applied here)", () => {
  it("0013 closes the audited grants without disabling row level security", () => {
    const sql = fs.readFileSync(path.join(root, "0013_close_privilege_gaps.sql"), "utf8");
    expect(sql.toLowerCase()).not.toContain("disable row level security;");
    expect(sql).toContain('drop policy if exists "Authenticated users can view profiles"');
    expect(sql).toContain("revoke update on table public.profiles");
    expect(sql).toContain("hidden tests");
    expect(sql).not.toMatch(/grant select \([\s\S]*hidden_test_cases/);
    expect(sql).toContain("grade");
    expect(sql).not.toContain("DROP TABLE");
  });

  it("0014 stops learners from writing their own practice scores", () => {
    const sql = fs.readFileSync(path.join(root, "0014_practice_answer_integrity.sql"), "utf8");
    expect(sql).toContain("Users can insert own practice progress");
    expect(sql).toContain("Users can insert own submissions");
    expect(sql.toLowerCase()).not.toContain("disable row level security;");
  });
});
