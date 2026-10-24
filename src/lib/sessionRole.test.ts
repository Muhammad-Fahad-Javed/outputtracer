import { describe, expect, it } from "vitest";
import {
  accountMenuFor,
  destinationAfterLogin,
  navLinksFor,
  roleHome,
} from "./sessionRole";

const student = { isAdmin: false, isVerifiedTeacher: false };
const teacher = { isAdmin: false, isVerifiedTeacher: true };
const admin = { isAdmin: true, isVerifiedTeacher: false };

describe("roleHome", () => {
  it("keeps an explicit learner on the student dashboard even when they are an approved teacher", () => {
    expect(roleHome("learner", teacher)).toBe("/classroom/student");
  });

  it("sends an approved teacher to the studio and an inactive teacher to activation", () => {
    expect(roleHome("teacher", teacher)).toBe("/classroom/teacher");
    expect(roleHome("teacher", student)).toBe("/classroom/teach/apply");
  });

  it("sends an admin only when the account is an admin", () => {
    expect(roleHome("admin", admin)).toBe("/admin");
    expect(roleHome("admin", student)).toBe("/classroom/student");
  });
});

describe("destinationAfterLogin", () => {
  it("replaces the shared classroom hub with the role home", () => {
    expect(
      destinationAfterLogin({ role: "teacher", ...teacher, next: "/classroom" })
    ).toBe("/classroom/teacher");
    expect(
      destinationAfterLogin({ role: "learner", ...teacher, next: "/classroom" })
    ).toBe("/classroom/student");
  });

  it("does not open the teacher studio for someone who is not approved", () => {
    expect(
      destinationAfterLogin({
        role: "teacher",
        ...student,
        next: "/classroom/teacher",
      })
    ).toBe("/classroom/teach/apply");
  });

  it("keeps an explicit project path and rejects an off-site next", () => {
    expect(
      destinationAfterLogin({ role: "learner", ...student, next: "/projects" })
    ).toBe("/projects");
    expect(
      destinationAfterLogin({ role: "learner", ...student, next: "https://evil.example" })
    ).toBe("/classroom/student");
  });
});

describe("navigation for the signed-in role", () => {
  it("hides assembly, python, and the teacher studio from a learner", () => {
    const labels = navLinksFor({
      signedIn: true,
      role: "learner",
      ...teacher,
    }).map((link) => link.label);
    expect(labels).toEqual(["Editor", "Projects", "Practice", "Learn", "My Classes"]);
    expect(accountMenuFor({ role: "learner", ...teacher }).map((item) => item.label)).toEqual([
      "My Profile",
      "All Projects",
      "Student Dashboard",
      "Switch to teacher",
    ]);
  });

  it("shows the studio to an approved teacher session and not the learner menu", () => {
    expect(
      navLinksFor({ signedIn: true, role: "teacher", ...teacher }).map((link) => link.href)
    ).toEqual(["/", "/projects/resume", "/classroom/teacher"]);
    expect(accountMenuFor({ role: "teacher", ...teacher }).map((item) => item.label)).not.toContain(
      "Student Dashboard"
    );
  });
});
