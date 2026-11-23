import { expect, it } from "vitest";
import { contributionColors } from "./contributionColors";

it("assigns different and stable colors to all teammates even when roster order changes", () => {
  const members = Array.from({ length: 20 }, (_, i) => `student-${i}`);
  const colors = contributionColors(members, []);
  expect(new Set(colors.values()).size).toBe(members.length);
  expect(contributionColors([...members].reverse(), members)).toEqual(colors);

  const withFormerAuthors = contributionColors(members, ["former-1", "former-2"]);
  expect(new Set(withFormerAuthors.values()).size).toBe(22);
  for (const [id, color] of colors) expect(withFormerAuthors.get(id)).toBe(color);
});
