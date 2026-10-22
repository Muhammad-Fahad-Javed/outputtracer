// Pure assignment access rules shared by the memory store, SQL rows, and routes.

export const CLASSROOM_TIME_LIMIT_CAP_MS = 10_000;
export const CLASSROOM_TIME_LIMIT_DEFAULT_MS = 10_000;
export const CLASSROOM_TIME_LIMIT_MIN_MS = 1_000;

export interface AssignmentPolicy {
  dueDate?: string;
  allowLate: boolean;
  locked: boolean;
  allowRun: boolean;
  allowTrace: boolean;
  timeLimitMs: number;
}

export function clampTimeLimitMs(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return CLASSROOM_TIME_LIMIT_DEFAULT_MS;
  const rounded = Math.round(n);
  if (rounded < CLASSROOM_TIME_LIMIT_MIN_MS) return CLASSROOM_TIME_LIMIT_MIN_MS;
  if (rounded > CLASSROOM_TIME_LIMIT_CAP_MS) return CLASSROOM_TIME_LIMIT_CAP_MS;
  return rounded;
}

export function policyFromRow(row: object): AssignmentPolicy {
  const data = row as Record<string, unknown>;
  const dueRaw = data.due_date ?? data.dueDate;
  const allowLate = data.allow_late ?? data.allowLate;
  const allowRun = data.allow_run ?? data.allowRun;
  const allowTrace = data.allow_trace ?? data.allowTrace;
  const timeRaw = data.time_limit_ms ?? data.timeLimitMs;
  return {
    dueDate: typeof dueRaw === "string" && dueRaw ? dueRaw : undefined,
    allowLate: allowLate !== false,
    locked: data.locked === true,
    allowRun: allowRun !== false,
    allowTrace: allowTrace === true,
    timeLimitMs: clampTimeLimitMs(timeRaw ?? CLASSROOM_TIME_LIMIT_DEFAULT_MS),
  };
}

export function isPastDue(dueDate: string | null | undefined, now = Date.now()): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate).getTime();
  if (!Number.isFinite(due)) return false;
  return now > due;
}

export function assignmentFreezeState(
  policy: Pick<AssignmentPolicy, "dueDate" | "allowLate" | "locked">,
  now = Date.now()
): { frozen: boolean; reason?: string } {
  if (policy.locked) {
    return { frozen: true, reason: "The teacher locked this assignment." };
  }
  if (isPastDue(policy.dueDate, now) && !policy.allowLate) {
    return {
      frozen: true,
      reason: "The due date has passed. Editing and running are closed.",
    };
  }
  return { frozen: false };
}

export function studentEditDenial(policy: {
  frozen: boolean;
  freezeReason?: string;
}): { status: number; error: string; code: "frozen" } | null {
  if (!policy.frozen) return null;
  return {
    status: 403,
    error: policy.freezeReason || "This assignment is locked.",
    code: "frozen",
  };
}

/**
 * Teachers can run a frozen document and can run when students cannot.
 * Trace is not part of this request: classroom runs stay on compile-and-run.
 */
export function studentRunDenial(
  policy: { frozen: boolean; freezeReason?: string; allowRun: boolean },
  isTeacher: boolean
): { status: number; error: string; code: "frozen" | "run-disabled" } | null {
  if (isTeacher) return null;
  const edit = studentEditDenial(policy);
  if (edit) return edit;
  if (!policy.allowRun) {
    return {
      status: 403,
      error: "Running is turned off for this assignment.",
      code: "run-disabled",
    };
  }
  return null;
}

export function classroomExecutionRequest(
  files: Record<string, string>,
  timeLimitMs: number,
  stdin: string
): { files: Record<string, string>; language: "cpp"; stdin: string; timeLimitMs: number } {
  return {
    files,
    language: "cpp",
    stdin,
    timeLimitMs: clampTimeLimitMs(timeLimitMs),
  };
}
