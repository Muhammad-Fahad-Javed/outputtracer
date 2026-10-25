import { describe, expect, it } from "vitest";
import { DOSBOX_ASSET_MANIFEST, packProjectSnapshot, projectSnapshotView, snapshotInputAssets, sourceFilesOnly } from "./projectSnapshot";
import { hashCodeFiles, computeVersionDiff } from "./versioningService";
import { fingerprintCacheKey, fingerprintFiles } from "./similarity";
import type { CodeVersion } from "./submissionTypes";

const source = { "main.asm": "bits 16\norg 100h\nmov ax,4c00h\nint 21h" };
const assets = { "SAMPLE.BIN": { base64: "AAEC/w==" } };
function version(id: string, codeFiles: Record<string, string>): CodeVersion {
  return { id, assignmentId: "a", studentId: "s", versionNumber: 1, codeFiles, contentHash: hashCodeFiles(codeFiles), language: "asm8086", createdAt: "2026-10-25" };
}
describe("immutable DOSBox project assets", () => {
  it("preserves exact binary bytes separately from source with a reproducible payload", () => {
    const payload = packProjectSnapshot(source, assets);
    expect(snapshotInputAssets(payload)).toEqual(assets);
    expect(sourceFilesOnly(payload)).toEqual(source);
    expect(projectSnapshotView(payload)).toEqual({ files: source, inputAssets: assets, contentHashScope: "source_and_input_assets_v1" });
    expect(packProjectSnapshot(source)).toEqual(source);
  });
  it("includes assets in the integrity hash and freezes the captured content", () => {
    const mutable = structuredClone(assets);
    const payload = packProjectSnapshot(source, mutable);
    mutable["SAMPLE.BIN"].base64 = "AQ==";
    expect(snapshotInputAssets(payload)).toEqual(assets);
    expect(hashCodeFiles(payload)).not.toBe(hashCodeFiles(packProjectSnapshot(source, mutable)));
  });
  it("rejects reserved source metadata, unsafe files and corrupted manifests", () => {
    expect(() => packProjectSnapshot({ ...source, [DOSBOX_ASSET_MANIFEST]: "{}" })).toThrow("Reserved");
    expect(() => packProjectSnapshot(source, { "EVIL.COM": { base64: "AA==" } })).toThrow();
    expect(() => snapshotInputAssets({ [DOSBOX_ASSET_MANIFEST]: "broken" })).toThrow();
    expect(() => snapshotInputAssets({ [DOSBOX_ASSET_MANIFEST]: '{"../X":{"base64":"AA=="}}' })).toThrow();
  });
  it("does not let common binary assets pollute similarity or source diffs", () => {
    const payload = packProjectSnapshot(source, assets);
    expect(fingerprintFiles(payload, {}, "asm8086")).toEqual(fingerprintFiles(source, {}, "asm8086"));
    expect(fingerprintCacheKey(payload, {}, "asm8086")).toBe(fingerprintCacheKey(source, {}, "asm8086"));
    expect(computeVersionDiff(version("old", source), version("new", payload)).fileDiffs.map(f => f.fileName)).toEqual(["main.asm"]);
  });
});
