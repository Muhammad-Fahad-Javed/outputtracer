/**
 * localExecutor.test.ts
 *
 * Regression tests for the Python interpreter resolution.
 *
 * The interpreter used to be a hard coded absolute path on one developer's
 * Windows machine, with "python" as the fallback. Both are wrong for a
 * deployed build:
 *
 *  - the absolute path is baked into the bundle and cannot exist on the Linux
 *    host the artefact is deployed to;
 *  - "python" does not exist on Amazon Linux 2023, which ships "python3".
 *
 * The interpreter must therefore be resolved at RUN time from PYTHON_PATH or
 * from PATH, for the platform the app is actually running on.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { findPythonPath } from "./localExecutor";

const IS_WINDOWS = process.platform === "win32";
// The first candidate this platform looks for.
const FIRST_CANDIDATE = IS_WINDOWS ? "python" : "python3";

let savedPath: string | undefined;
let savedPathExt: string | undefined;
let savedPythonPath: string | undefined;
let tmpDir: string | undefined;

beforeEach(() => {
  savedPath = process.env.PATH;
  savedPathExt = process.env.PATHEXT;
  savedPythonPath = process.env.PYTHON_PATH;
});

afterEach(() => {
  if (savedPath === undefined) delete process.env.PATH;
  else process.env.PATH = savedPath;
  if (savedPathExt === undefined) delete process.env.PATHEXT;
  else process.env.PATHEXT = savedPathExt;
  if (savedPythonPath === undefined) delete process.env.PYTHON_PATH;
  else process.env.PYTHON_PATH = savedPythonPath;
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

describe("findPythonPath", () => {
  it("uses PYTHON_PATH when it is set and the file exists", () => {
    const real = path.join(__filename);
    expect(fs.existsSync(real)).toBe(true);

    process.env.PYTHON_PATH = real;
    expect(findPythonPath()).toBe(real);
  });

  it("ignores PYTHON_PATH when the file does not exist", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ot-py-"));
    const fake = path.join(tmpDir, "python3" + (IS_WINDOWS ? ".exe" : ""));
    fs.writeFileSync(fake, "#!/bin/sh\n");
    process.env.PYTHON_PATH = path.join(tmpDir, "does-not-exist");
    process.env.PATH = tmpDir;
    if (IS_WINDOWS) process.env.PATHEXT = ".EXE;.CMD;.BAT";

    const found = findPythonPath();
    expect(found).not.toBe(path.join(tmpDir, "does-not-exist"));
    expect(found).toBe(fake);
  });

  it("finds the interpreter on PATH", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ot-py-"));
    const fake = path.join(tmpDir, FIRST_CANDIDATE + (IS_WINDOWS ? ".exe" : ""));
    fs.writeFileSync(fake, "#!/bin/sh\n");

    delete process.env.PYTHON_PATH;
    process.env.PATH = tmpDir;
    if (IS_WINDOWS) process.env.PATHEXT = ".EXE;.CMD;.BAT";

    expect(findPythonPath()).toBe(fake);
  });

  it("never returns a path baked in at build time", () => {
    delete process.env.PYTHON_PATH;
    process.env.PATH = "";
    if (IS_WINDOWS) process.env.PATHEXT = "";

    const found = findPythonPath();
    // With nothing on PATH the result must be a bare interpreter name, never
    // an absolute path from the machine that produced the build.
    expect(found).not.toMatch(/^[A-Za-z]:[\\/]/);
    expect(found).not.toContain("DELL");
    expect(found).toBe(IS_WINDOWS ? "python" : "python3");
  });

  it("prefers python3 on POSIX and python on Windows", () => {
    delete process.env.PYTHON_PATH;
    process.env.PATH = "";
    if (IS_WINDOWS) process.env.PATHEXT = "";

    const found = findPythonPath();
    if (IS_WINDOWS) {
      expect(found).toBe("python");
    } else {
      expect(found).toBe("python3");
    }
  });
});
