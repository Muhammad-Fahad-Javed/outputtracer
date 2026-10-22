import { describe, expect, it } from "vitest";
import { safeNextPath } from "./roles";

describe("safeNextPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNextPath("/projects")).toBe("/projects");
    expect(safeNextPath("/classroom/student")).toBe("/classroom/student");
    expect(safeNextPath("/practice/basic-syntax/bs-01?x=1")).toBe(
      "/practice/basic-syntax/bs-01?x=1"
    );
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example")).toBe("/classroom/student");
    expect(safeNextPath("//evil.example")).toBe("/classroom/student");
    expect(safeNextPath("///evil.example")).toBe("/classroom/student");
  });

  it("rejects paths that browsers normalise into another origin", () => {
    expect(safeNextPath("/\\evil.example")).toBe("/classroom/student");
    expect(safeNextPath("/\t/evil.example")).toBe("/classroom/student");
    expect(safeNextPath("/\n/evil.example")).toBe("/classroom/student");
  });

  it("falls back for empty or missing values", () => {
    expect(safeNextPath(undefined)).toBe("/classroom/student");
    expect(safeNextPath("")).toBe("/classroom/student");
    expect(safeNextPath("projects")).toBe("/classroom/student");
  });

  it("uses a caller-supplied fallback", () => {
    expect(safeNextPath(undefined, "/classroom/teacher")).toBe("/classroom/teacher");
  });
});
