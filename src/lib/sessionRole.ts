import { safeNextPath } from "@/lib/cloud/roles";

export const SESSION_ROLE_COOKIE = "ot_role";

export const LEARNER_HOME = "/classroom/student";
export const TEACHER_HOME = "/classroom/teacher";
export const ADMIN_HOME = "/admin";

/** The shared hub. Login used to drop every teacher here. */
const LEGACY_CLASSROOM_HUB = "/classroom";

export type SessionRole = "learner" | "teacher" | "admin";

export interface RoleCapabilities {
  isAdmin: boolean;
  isVerifiedTeacher: boolean;
}

export function parseSessionRole(value: string | null | undefined): SessionRole | null {
  if (value === "learner" || value === "teacher" || value === "admin") return value;
  return null;
}

/**
 * Where this sign-in should land.
 * An approved teacher profile does not override an explicit learner choice.
 * A teacher choice only opens the studio when the account is actually approved.
 */
export function roleHome(role: SessionRole, caps: RoleCapabilities): string {
  if (role === "admin") return caps.isAdmin ? ADMIN_HOME : LEARNER_HOME;
  if (role === "teacher") return caps.isVerifiedTeacher ? TEACHER_HOME : LEARNER_HOME;
  return LEARNER_HOME;
}

export function destinationAfterLogin(input: {
  role: SessionRole | null;
  isAdmin: boolean;
  isVerifiedTeacher: boolean;
  next?: string | null;
}): string {
  const roleForHome = input.role ?? "learner";
  const home = roleHome(roleForHome, input);
  if (!input.next) return home;

  const safe = safeNextPath(input.next, home);
  const pathOnly = safe.split("?")[0];
  if (pathOnly === LEGACY_CLASSROOM_HUB) return home;
  if (pathOnly === TEACHER_HOME && !input.isVerifiedTeacher) return LEARNER_HOME;
  if (pathOnly === ADMIN_HOME && !input.isAdmin) return LEARNER_HOME;
  return safe;
}

export interface NavLink {
  label: string;
  href: string;
}

/** Header links for the signed-in role. Assembly and Python stay off this menu. */
export function navLinksFor(input: {
  signedIn: boolean;
  role: SessionRole | null;
  isVerifiedTeacher: boolean;
  isAdmin: boolean;
}): NavLink[] {
  const cpp: NavLink = { label: "C++", href: "/" };
  const practice: NavLink = { label: "Practice", href: "/practice" };
  const learn: NavLink = { label: "Learn", href: "/learn" };
  const classes: NavLink = { label: "My Classes", href: LEARNER_HOME };

  if (!input.signedIn) return [cpp, practice, learn];
  if (input.role === "admin" && input.isAdmin) {
    return [cpp, { label: "Admin", href: ADMIN_HOME }];
  }
  if (input.role === "teacher" && input.isVerifiedTeacher) {
    return [cpp, { label: "Teacher Studio", href: TEACHER_HOME }];
  }
  return [cpp, practice, learn, classes];
}

export function accountMenuFor(input: {
  role: SessionRole | null;
  isVerifiedTeacher: boolean;
  isAdmin: boolean;
}): NavLink[] {
  const profile: NavLink = { label: "My Profile", href: "/profile" };
  if (input.role === "teacher" && input.isVerifiedTeacher) {
    return [
      profile,
      { label: "Teacher Studio", href: TEACHER_HOME },
      { label: "Switch to learner", href: "/auth/continue?role=learner" },
    ];
  }
  if (input.role === "admin" && input.isAdmin) {
    return [
      profile,
      { label: "Admin Center", href: ADMIN_HOME },
      { label: "Switch to learner", href: "/auth/continue?role=learner" },
    ];
  }
  const items = [profile, { label: "Student Dashboard", href: LEARNER_HOME }];
  if (input.isVerifiedTeacher) {
    items.push({ label: "Switch to teacher", href: "/auth/continue?role=teacher" });
  }
  return items;
}

export function roleBadge(input: {
  role: SessionRole | null;
  isVerifiedTeacher: boolean;
  isAdmin: boolean;
}): "Admin" | "Teacher" | "Learner" {
  if (input.role === "admin" && input.isAdmin) return "Admin";
  if (input.role === "teacher" && input.isVerifiedTeacher) return "Teacher";
  return "Learner";
}
