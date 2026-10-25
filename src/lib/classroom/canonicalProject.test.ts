import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { encodeDoc } from "@/lib/cloud/collabDoc";
const state = vi.hoisted(() => ({ live: null as Record<string, string> | null, assets: null as Record<string, { base64: string }> | null, stored: null as { files: Record<string, string>; stateB64: string } | null }));
vi.mock("@/lib/cloud/collabHub", () => ({ getHub: () => ({ peekClassroomFiles: () => state.live, peekClassroomAssets: () => state.assets }) }));
vi.mock("./documents", async importOriginal => ({ ...(await importOriginal<object>()), readClassroomDocument: async () => state.stored }));
import { loadCanonicalClassroomProject } from "./classroomRun";
const owner = { docKey: "clsdoc:a:group:g", starterCode: { "main.asm": "starter" } };
beforeEach(() => { state.live = null; state.assets = null; state.stored = null; });
describe("canonical shared DOSBox project capture", () => {
  it("captures live source and uploaded data together without using stale persisted assets", async () => {
    state.live = { "main.asm": "live" };
    state.assets = { "INPUT.BIN": { base64: "AP8=" } };
    const project = await loadCanonicalClassroomProject(owner);
    state.assets["INPUT.BIN"].base64 = "AA==";
    expect(project).toEqual({ files: { "main.asm": "live" }, inputAssets: { "INPUT.BIN": { base64: "AP8=" } } });
  });
  it("recovers uploaded data from persisted shared state when no room is open", async () => {
    const doc = new Y.Doc();
    doc.getMap("dosAssets").set("INPUT.BIN", { base64: "AAEC/w==" });
    state.stored = { files: { "main.asm": "persisted" }, stateB64: encodeDoc(doc) };
    doc.destroy();
    expect(await loadCanonicalClassroomProject(owner)).toEqual({ files: state.stored.files, inputAssets: { "INPUT.BIN": { base64: "AAEC/w==" } } });
  });
  it("fails instead of silently omitting invalid persisted assets from a submission", async () => {
    const doc = new Y.Doc();
    doc.getMap("dosAssets").set("EVIL.EXE", { base64: "AA==" });
    state.stored = { files: { "main.asm": "persisted" }, stateB64: encodeDoc(doc) };
    doc.destroy();
    await expect(loadCanonicalClassroomProject(owner)).rejects.toThrow();
  });
  it("preserves existing source-only assignments and starter fallback", async () => {
    expect(await loadCanonicalClassroomProject(owner)).toEqual({ files: owner.starterCode, inputAssets: {} });
  });
});
