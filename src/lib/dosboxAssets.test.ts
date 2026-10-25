import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { bytesToBase64 } from "@/lib/cloud/base64";
import { decodeDosboxAssets, inspectDosboxAssets, isDosboxAssetName, normalizeDosboxAssetName, readDosboxAssets, sameDosboxAssets } from "./dosboxAssets";

describe("DOS input assets", () => {
  it("preserves binary bytes and empty files through a shared document snapshot", () => {
    const doc = new Y.Doc();
    doc.getMap("dosAssets").set("SAMPLE.BIN", { base64: bytesToBase64(new Uint8Array([0, 255, 13, 10, 128])) });
    doc.getMap("dosAssets").set("EMPTY.DAT", { base64: "" });
    const copy = new Y.Doc(); Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    const decoded = decodeDosboxAssets(readDosboxAssets(copy));
    expect([...decoded["SAMPLE.BIN"]]).toEqual([0, 255, 13, 10, 128]);
    expect(decoded["EMPTY.DAT"].length).toBe(0);
    expect(sameDosboxAssets(doc, copy)).toBe(true);
    copy.getMap("dosAssets").set("OTHER.DAT", { base64: "" });
    expect(sameDosboxAssets(doc, copy)).toBe(false);
    doc.destroy(); copy.destroy();
  });

  it.each(["../X.BIN", "INPUT/X.BIN", "X\\Y.BIN", "TOOLONGNAME.BIN", "A.LONG", "CON", "NUL.TXT", "COM1.BIN", "MAIN.ASM", "UTIL.INC", "APP.EXE", "APP.COM", "RUN.BAT", "x.bin"])("rejects unsafe input filename %s", (name) => {
    expect(isDosboxAssetName(name)).toBe(false);
    expect(inspectDosboxAssets({ [name]: { base64: "" } }).ok).toBe(false);
  });

  it("normalizes uploaded names and rejects oversized or malformed data", () => {
    expect(normalizeDosboxAssetName(" sample.bin ")).toBe("SAMPLE.BIN");
    expect(inspectDosboxAssets({ "A.BIN": { base64: "?!" } }).ok).toBe(false);
    expect(inspectDosboxAssets({ "A.BIN": { base64: "a" } }).ok).toBe(false);
    expect(inspectDosboxAssets({ "A.BIN": { base64: "", extra: "value" } }).ok).toBe(false);
    const big = bytesToBase64(new Uint8Array(256 * 1024 + 1));
    expect(inspectDosboxAssets({ "BIG.BIN": { base64: big } }).ok).toBe(false);
    const full = bytesToBase64(new Uint8Array(256 * 1024));
    expect(inspectDosboxAssets(Object.fromEntries(Array.from({ length: 5 }, (_, n) => [`A${n}.BIN`, { base64: full }]))).ok).toBe(false);
    expect(inspectDosboxAssets(Object.fromEntries(Array.from({ length: 17 }, (_, n) => [`A${n}.BIN`, { base64: "" }]))).ok).toBe(false);
  });
});
