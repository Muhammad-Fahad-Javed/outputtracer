import { describe, expect, it } from "vitest";
import { needsCloudSync, parseLocalProject, pickNewer, type LocalProjectRecord } from "./localProjectStore";

function record(savedAt: number, syncedAt: number | null): LocalProjectRecord {
  return {
    projectId: "p1",
    stateB64: "abc",
    standard: "c++17",
    savedAt,
    syncedAt,
    boot: "yjs",
  };
}

describe("local project snapshots", () => {
  it("keeps the newer save when the tab and the database disagree", () => {
    expect(pickNewer(record(10, 10), record(12, 10))?.savedAt).toBe(12);
    expect(pickNewer(record(15, 15), null)?.savedAt).toBe(15);
    expect(pickNewer(null, null)).toBeNull();
  });

  it("knows when the cloud has not caught up", () => {
    expect(needsCloudSync(record(20, 10))).toBe(true);
    expect(needsCloudSync(record(20, null))).toBe(true);
    expect(needsCloudSync(record(20, 20))).toBe(false);
  });

  it("rejects a broken snapshot", () => {
    expect(parseLocalProject(null)).toBeNull();
    expect(parseLocalProject({ projectId: "p", savedAt: 1 })).toBeNull();
    expect(parseLocalProject(record(1, 1))?.boot).toBe("yjs");
  });
});
