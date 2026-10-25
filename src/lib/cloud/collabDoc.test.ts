import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { createFile, deleteFile, encodeDoc, applyEncoded, readFiles, renameFile, seedDoc } from "./collabDoc";

describe("project document", () => {
  it("round-trips file text through a Yjs snapshot", () => {
    const doc = new Y.Doc();
    seedDoc(doc, { "main.cpp": "int main(){return 0;}\n", "helper.h": "#pragma once\n" });
    const copy = new Y.Doc();
    applyEncoded(copy, encodeDoc(doc));
    expect(readFiles(copy)).toEqual(readFiles(doc));
  });

  it("rejects a second file with the same name and keeps one cpp file", () => {
    const doc = new Y.Doc();
    seedDoc(doc, { "main.cpp": "int main(){return 0;}\n" });
    expect(createFile(doc, "main.cpp", "").ok).toBe(false);
    expect(createFile(doc, "../etc/passwd", "").ok).toBe(false);
    expect(deleteFile(doc, "main.cpp").ok).toBe(false);
    expect(createFile(doc, "helper.h", "#pragma once\n").ok).toBe(true);
    expect(deleteFile(doc, "helper.h").ok).toBe(true);
    expect(Object.keys(readFiles(doc))).toEqual(["main.cpp"]);
    expect(renameFile(doc, "main.cpp", "app.cpp").ok).toBe(true);
    expect(readFiles(doc)["app.cpp"]).toContain("return 0");
    expect(renameFile(doc, "app.cpp", "app.cpp").ok).toBe(true);
    expect(renameFile(doc, "app.cpp", "../x.cpp").ok).toBe(false);
  });

  it("keeps Python files and the required entry file when adding, renaming or deleting", () => {
    const doc = new Y.Doc();
    seedDoc(doc, { "main.py": "from helpers import answer\n", "helpers.py": "answer = 42\n" });
    expect(createFile(doc, "bad.cpp", "", "python").ok).toBe(false);
    expect(renameFile(doc, "helpers.py", "maths.py", "python").ok).toBe(true);
    expect(renameFile(doc, "main.py", "app.py", "python").ok).toBe(false);
    expect(deleteFile(doc, "main.py", "python").ok).toBe(false);
    expect(deleteFile(doc, "maths.py", "python").ok).toBe(true);
    doc.destroy();
  });

  it("treats DOS filenames as case-insensitive and preserves main.asm", () => {
    const doc = new Y.Doc();
    seedDoc(doc, { "main.asm": "org 100h\n", "IO.INC": "; include\n" });
    expect(createFile(doc, "io.inc", "", "asm8086").ok).toBe(false);
    expect(createFile(doc, "MAIN.ASM", "", "asm8086").ok).toBe(false);
    expect(renameFile(doc, "IO.INC", "helpers.inc", "asm8086").ok).toBe(true);
    expect(createFile(doc, "extra.asm", "", "asm8086").ok).toBe(true);
    expect(renameFile(doc, "main.asm", "app.asm", "asm8086").ok).toBe(false);
    expect(deleteFile(doc, "main.asm", "asm8086").ok).toBe(false);
    doc.destroy();
  });
});
