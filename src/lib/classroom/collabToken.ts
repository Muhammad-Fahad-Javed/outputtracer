import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export interface ClassroomCollabClaims {
  userId: string;
  displayName: string;
  classId: string;
  assignmentId: string;
  groupId?: string;
  studentId?: string;
  exp: number;
}

const TOKEN_TTL_MS = 10 * 60 * 1000;

function secret(): string {
  if (process.env.CLASSROOM_COLLAB_SECRET) return process.env.CLASSROOM_COLLAB_SECRET;
  const globalState = globalThis as typeof globalThis & { __classroomCollabSecret?: string };
  if (!globalState.__classroomCollabSecret) {
    globalState.__classroomCollabSecret = randomBytes(32).toString("hex");
  }
  return globalState.__classroomCollabSecret;
}

export function classroomCollabTtlMs(): number {
  return TOKEN_TTL_MS;
}

export function signClassroomCollabToken(
  claims: Omit<ClassroomCollabClaims, "exp"> & { exp?: number }
): string {
  const full: ClassroomCollabClaims = {
    ...claims,
    exp: claims.exp ?? Date.now() + TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyClassroomCollabToken(token: string): ClassroomCollabClaims | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = createHmac("sha256", secret()).update(parts[0]).digest("base64url");
  const actual = Buffer.from(parts[1]);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as ClassroomCollabClaims;
    if (!claims || typeof claims.userId !== "string" || typeof claims.classId !== "string") return null;
    if (typeof claims.assignmentId !== "string" || typeof claims.exp !== "number") return null;
    if (Date.now() > claims.exp) return null;
    return claims;
  } catch {
    return null;
  }
}
