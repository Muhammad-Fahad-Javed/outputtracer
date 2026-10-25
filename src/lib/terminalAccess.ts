import { accessFromToken } from "./cloud/accessToken";
import { getHub } from "./cloud/collabHub";
import { canEdit, isUuid } from "./cloud/roles";
import { createAdminClient } from "./supabase/admin";
import { studentRunDenial } from "./classroom/assignmentPolicy";
import type { TerminalInitPayload } from "./wsTerminal";
import { execConfig } from "./execConfig";

export interface TerminalRequestPayload {
  language?: "cpp" | "python";
  files?: Record<string, string>;
  standard?: string;
  projectId?: string;
  accessToken?: string;
  classroom?: { classId: string; assignmentId: string; groupId?: string; studentId?: string };
}

type Resolution = { ok: true; payload: TerminalInitPayload } | { ok: false; message: string };

/** Server authorization and canonical source selection for both terminal runtimes. */
export async function resolveTerminalPayload(raw: TerminalRequestPayload): Promise<Resolution> {
  if (!raw || typeof raw !== "object" || (raw.language !== undefined && raw.language !== "cpp" && raw.language !== "python")) {
    return { ok: false, message: "Choose a C++ or Python terminal." };
  }
  if (raw.classroom) {
    if (raw.projectId) return { ok: false, message: "Choose one workspace." };
    const scope = raw.classroom;
    if (!scope || typeof scope !== "object" || !isUuid(scope.classId) || !isUuid(scope.assignmentId) ||
      (scope.groupId !== undefined && !isUuid(scope.groupId)) || (scope.studentId !== undefined && !isUuid(scope.studentId))) {
      return { ok: false, message: "Invalid classroom workspace." };
    }
    const token = raw.accessToken;
    const admin = createAdminClient();
    if (!admin || typeof token !== "string" || !token || token.length > 12000) return { ok: false, message: "Sign in to run this assignment." };
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return { ok: false, message: "Sign in to run this assignment." };
    // These repositories import next/headers. Load them only after next.prepare()
    // initializes the custom server's async request infrastructure.
    const [{getClassroom},{resolveClassroomDocument},{loadCanonicalClassroomFiles}] = await Promise.all([
      import("./classroom/classroomService"), import("./classroom/documents"), import("./classroom/classroomRun"),
    ]);
    const actorId = data.user.id;
    const resolve = async () => {
      const access = await getClassroom(actorId, scope.classId);
      if (!access.success) return null;
      const resolved = await resolveClassroomDocument({ actorId, classroomId: scope.classId, assignmentId: scope.assignmentId,
        isTeacher: Boolean(access.isTeacher), groupId: scope.groupId, studentId: scope.studentId });
      if (!resolved.ok || studentRunDenial(resolved.doc, Boolean(access.isTeacher))) return null;
      return resolved.doc;
    };
    const doc = await resolve();
    if (!doc) return { ok: false, message: "Running is unavailable for this assignment or you do not have access." };
    if ((doc.language !== "cpp" && doc.language !== "python") || (raw.language && raw.language !== doc.language)) {
      return { ok: false, message: "This terminal does not match the assignment language." };
    }
    return { ok: true, payload: {
      language: doc.language, files: await loadCanonicalClassroomFiles(doc), ownerKey: actorId,
      // Human input can wait without consuming the assignment's CPU budget.
      timeoutMs: execConfig.interactiveTimeoutMs, cpuTimeMs: doc.timeLimitMs,
      validateAccess: async () => {
        const auth = await admin.auth.getUser(token);
        if (auth.error || auth.data.user?.id !== actorId) return false;
        const current = await resolve();
        return Boolean(current && current.docKey === doc.docKey && current.language === doc.language);
      },
    } };
  }
  if (raw.projectId) {
    const access = await accessFromToken(raw.accessToken || "", raw.projectId);
    if (!access) return { ok: false, message: "You do not have access to run this project." };
    let shared = await getHub().readFiles(raw.projectId);
    const language = shared.language;
    if (language === "asm8086") return { ok: false, message: "Run this Assembly project in browser DOSBox." };
    if (raw.language && raw.language !== language) return { ok: false, message: "This terminal does not match the project language." };
    if (language === "python" && raw.standard) return { ok: false, message: "Python projects do not use a C++ standard." };
    if (raw.standard && canEdit(access.role)) {
      await getHub().setStandard(raw.projectId, raw.standard);
      shared = await getHub().readFiles(raw.projectId);
    }
    return { ok: true, payload: { language, files: shared.files, standard: shared.standard ?? undefined, ownerKey: access.userId,
      validateAccess: async () => (await accessFromToken(raw.accessToken || "", raw.projectId!))?.userId === access.userId,
    } };
  }
  if (!raw.files || typeof raw.files !== "object" || Array.isArray(raw.files)) return { ok: false, message: "Invalid init payload: missing files." };
  const language = raw.language || "cpp";
  // Keep Python's existing sign-in requirement; anonymous C++ remains available.
  if (language === "python" && raw.accessToken === undefined) return { ok: false, message: "Sign in to run Python in the console." };
  let ownerKey: string | undefined;
  let validateAccess: (() => Promise<boolean>) | undefined;
  if (raw.accessToken !== undefined) {
    const token = raw.accessToken;
    const admin = createAdminClient();
    if (!admin || typeof token !== "string" || !token || token.length > 12000) return { ok: false, message: "Your session expired. Sign in again." };
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return { ok: false, message: "Your session expired. Sign in again." };
    ownerKey = data.user.id;
    validateAccess = async () => {
      const current = await admin.auth.getUser(token);
      return !current.error && current.data.user?.id === ownerKey;
    };
  }
  return { ok: true, payload: { language, files: raw.files, standard: raw.standard, ownerKey, validateAccess } };
}

/** Fail closed when a running classroom/project loses permission. */
export function monitorTerminalAccess(ws: import("ws").WebSocket, validate?: () => Promise<boolean>, intervalMs = 5000, cancel?: () => void): void {
  if (!validate) return;
  let checking = false;
  const timer = setInterval(() => {
    if (checking || ws.readyState !== ws.OPEN) return;
    checking = true;
    void validate().then((ok) => {
      if (!ok && ws.readyState === ws.OPEN) {
        cancel?.();
        ws.send(JSON.stringify({ type: "error", data: "Workspace access or execution permission changed." }));
        ws.close(1008, "Execution permission changed");
      }
    }).catch(() => { cancel?.(); ws.close(1008, "Could not verify execution permission"); }).finally(() => { checking = false; });
  }, intervalMs);
  timer.unref?.();
  ws.once("close", () => clearInterval(timer));
}
