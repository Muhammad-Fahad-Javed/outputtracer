import { describe, expect, it } from "vitest";
import { buildDeterminismNote, detectNondeterminism } from "./traceDeterminism";

describe("detectNondeterminism", () => {
  it("returns nothing for plainly deterministic code", () => {
    expect(
      detectNondeterminism({
        "main.cpp": `#include <iostream>
int main(){ std::cout << 1 + 1; }`,
      })
    ).toEqual([]);
  });

  it("detects rand/srand and clock usage", () => {
    const reasons = detectNondeterminism({
      "main.cpp": `int main(){ srand(time(0)); return rand() % 6; }`,
    });
    const joined = reasons.join(" ");
    expect(reasons.length).toBeGreaterThan(0);
    expect(joined).toMatch(/random/i);
    expect(joined).toMatch(/clock/i);
  });

  it("ignores non-source files", () => {
    expect(detectNondeterminism({ "notes.txt": "time(0) rand()" })).toEqual([]);
  });

  it("returns an empty list when there are no files", () => {
    expect(detectNondeterminism(undefined)).toEqual([]);
  });
});

describe("buildDeterminismNote", () => {
  it("explains the trace is a second execution", () => {
    const note = buildDeterminismNote(["reads the clock (time()/clock())"]);
    expect(note).toContain("second, independent execution");
    expect(note).toContain("authoritative");
  });
});
