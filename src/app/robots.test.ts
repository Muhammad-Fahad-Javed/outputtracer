import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots.txt", () => {
  it("disallows private routes as prefixes and keeps public labs crawlable", () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const disallow = rule.disallow ?? [];
    expect(disallow).toEqual(expect.arrayContaining([
      "/projects",
      "/groups",
      "/admin",
      "/profile",
      "/learn/dashboard",
      "/classroom/student",
      "/p/",
    ]));
    expect(disallow).not.toContain("/p");
    expect(disallow).not.toContain("/practice");
    expect(disallow).not.toContain("/python");
  });
});
