/**
 * versioningService.ts
 *
 * Manages code versions, submission snapshots, activity events,
 * code diffs, and execution logs.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthConfigured } from "@/lib/supabase/env";
import { createHash } from "crypto";
import type {
  CodeVersion,
  SaveVersionInput,
  ActivityEvent,
  ActivityEventType,
  SubmissionSnapshot,
  ExecutionLog,
  StudentExecutionLog,
  VersionDiff,
  CodeFileDiff,
  DiffHunk,
  SandboxResult,
  RunMode,
} from "./submissionTypes";

// ==============================================================================
// In-memory stores (for tests / offline development)
// ==============================================================================
const memVersions = new Map<string, CodeVersion[]>(); // `${assignmentId}:${ownerId}` -> versions
const memSnapshots = new Map<string, SubmissionSnapshot>(); // submissionId -> snapshot
const memActivityEvents = new Map<string, ActivityEvent[]>(); // assignmentId -> events
const memExecLogs = new Map<string, ExecutionLog[]>(); // assignmentId -> logs

export function _resetVersioningMemory(): void {
  memVersions.clear();
  memSnapshots.clear();
  memActivityEvents.clear();
  memExecLogs.clear();
}

// ==============================================================================
// Helpers
// ==============================================================================

/** Compute a deterministic SHA-256 hash of a code files record */
export function hashCodeFiles(files: Record<string, string>): string {
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))
  );
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function versionOwnerKey(assignmentId: string, studentId?: string, groupId?: string): string {
  return `${assignmentId}:${studentId ?? groupId ?? "unknown"}`;
}

// ==============================================================================
// Code Versions
// ==============================================================================

/**
 * Saves a new immutable code version. Returns the created version.
 * The versionNumber is automatically incremented per owner per assignment.
 */
export async function saveCodeVersion(input: SaveVersionInput): Promise<CodeVersion> {
  const contentHash = hashCodeFiles(input.codeFiles);
  const ownerKey = versionOwnerKey(input.assignmentId, input.studentId, input.groupId);

  const admin = createAdminClient();
  if (admin) {
    const ownerCol = input.studentId ? "student_id" : "group_id";
    const ownerVal = (input.studentId ?? input.groupId)!;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { data: existing } = await admin
          .from("assignment_code_versions")
          .select("version_number")
          .eq("assignment_id", input.assignmentId)
          .eq(ownerCol, ownerVal)
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle();

        const nextVersion = ((existing?.version_number as number | null) ?? 0) + 1;

        const { data, error } = await admin
          .from("assignment_code_versions")
          .insert({
            assignment_id: input.assignmentId,
            student_id: input.studentId ?? null,
            group_id: input.groupId ?? null,
            version_number: nextVersion,
            code_files: input.codeFiles,
            content_hash: contentHash,
            language: input.language ?? "cpp",
          })
          .select()
          .single();

        if (!error && data) {
          return {
            id: data.id,
            assignmentId: data.assignment_id,
            studentId: data.student_id ?? undefined,
            groupId: data.group_id ?? undefined,
            versionNumber: data.version_number,
            codeFiles: data.code_files as Record<string, string>,
            contentHash: data.content_hash,
            language: data.language,
            createdAt: data.created_at,
          };
        }

        // Check if error is a unique constraint collision on version_number (Postgres code 23505)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pgErr = error as any;
        if (pgErr?.code === "23505" && attempt < maxRetries - 1) {
          continue; // retry to fetch next increment
        }

        console.warn("Failed saving code version to database:", error?.message);
        throw new Error(error?.message || "Database insert failed for code version.");
      } catch (err: unknown) {
        if (attempt === maxRetries - 1) {
          console.warn("Failed saving code version after retries:", err);
          throw err;
        }
      }
    }
  }

  // If Supabase is configured but admin client failed or threw, do not fake in-memory persistence in production
  if (isAuthConfigured()) {
    throw new Error("Durable database client is unavailable. Cannot save code version to transient memory.");
  }

  // Memory fallback for offline local tests

  // Memory fallback
  const existing = memVersions.get(ownerKey) ?? [];
  const versionNumber = existing.length + 1;
  const version: CodeVersion = {
    id: `ver-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    assignmentId: input.assignmentId,
    studentId: input.studentId,
    groupId: input.groupId,
    versionNumber,
    codeFiles: { ...input.codeFiles },
    contentHash,
    language: input.language ?? "cpp",
    createdAt: new Date().toISOString(),
  };
  memVersions.set(ownerKey, [...existing, version]);
  return version;
}

/**
 * Lists all code versions for a student/group on an assignment. Newest first.
 */
export async function listCodeVersions(
  assignmentId: string,
  studentId?: string,
  groupId?: string
): Promise<CodeVersion[]> {
  const admin = createAdminClient();
  if (admin) {
    try {
      const query = admin
        .from("assignment_code_versions")
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("version_number", { ascending: false });

      const filtered = studentId
        ? query.eq("student_id", studentId)
        : query.eq("group_id", groupId!);

      const { data, error } = await filtered;
      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (data as any[]).map((d) => ({
          id: d.id as string,
          assignmentId: d.assignment_id as string,
          studentId: (d.student_id as string | null) ?? undefined,
          groupId: (d.group_id as string | null) ?? undefined,
          versionNumber: d.version_number as number,
          codeFiles: d.code_files as Record<string, string>,
          contentHash: d.content_hash as string,
          language: d.language as string,
          createdAt: d.created_at as string,
        }));
      }
    } catch {
      // Fall through
    }
  }

  const ownerKey = versionOwnerKey(assignmentId, studentId, groupId);
  return [...(memVersions.get(ownerKey) ?? [])].reverse();
}

/**
 * Gets a single code version by ID.
 */
export async function getCodeVersion(versionId: string): Promise<CodeVersion | null> {
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("assignment_code_versions")
        .select("*")
        .eq("id", versionId)
        .single();
      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any;
        return {
          id: d.id,
          assignmentId: d.assignment_id,
          studentId: d.student_id ?? undefined,
          groupId: d.group_id ?? undefined,
          versionNumber: d.version_number,
          codeFiles: d.code_files,
          contentHash: d.content_hash,
          language: d.language,
          createdAt: d.created_at,
        };
      }
    } catch {
      // Fall through
    }
  }

  // Search memory
  for (const versions of memVersions.values()) {
    const found = versions.find((v) => v.id === versionId);
    if (found) return found;
  }
  return null;
}

// ==============================================================================
// Submission Snapshots
// ==============================================================================

/**
 * Creates an immutable submission snapshot.
 * MUST be called inside the submit flow — links the submission to the exact version.
 */
export async function createSubmissionSnapshot(input: {
  submissionId: string;
  versionId: string;
  assignmentId: string;
  studentId?: string;
  groupId?: string;
  codeFiles: Record<string, string>;
  isLate: boolean;
}): Promise<SubmissionSnapshot> {
  const contentHash = hashCodeFiles(input.codeFiles);
  const now = new Date().toISOString();

  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("submission_snapshots")
        .insert({
          submission_id: input.submissionId,
          version_id: input.versionId,
          assignment_id: input.assignmentId,
          student_id: input.studentId ?? null,
          group_id: input.groupId ?? null,
          frozen_code_files: input.codeFiles,
          content_hash: contentHash,
          is_late: input.isLate,
        })
        .select()
        .single();

      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any;
        return {
          id: d.id,
          submissionId: d.submission_id,
          versionId: d.version_id,
          assignmentId: d.assignment_id,
          studentId: d.student_id ?? undefined,
          groupId: d.group_id ?? undefined,
          frozenCodeFiles: d.frozen_code_files,
          contentHash: d.content_hash,
          submittedAt: d.submitted_at,
          isLate: d.is_late,
        };
      }

      console.warn("Failed creating submission snapshot in database:", error?.message);
      throw new Error(error?.message || "Failed to insert submission snapshot.");
    } catch (err) {
      console.warn("Error in createSubmissionSnapshot database operation:", err);
      throw err;
    }
  }

  if (isAuthConfigured()) {
    throw new Error("Durable database client is unavailable. Cannot create snapshot in transient memory.");
  }

  const snapshot: SubmissionSnapshot = {
    id: `snap-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    submissionId: input.submissionId,
    versionId: input.versionId,
    assignmentId: input.assignmentId,
    studentId: input.studentId,
    groupId: input.groupId,
    frozenCodeFiles: { ...input.codeFiles },
    contentHash,
    submittedAt: now,
    isLate: input.isLate,
  };
  memSnapshots.set(input.submissionId, snapshot);
  return snapshot;
}

/**
 * Retrieves the latest immutable snapshot for a submission. Previous hand-ins
 * remain unchanged, including any snapshots referenced by existing grades.
 */
export async function getSubmissionSnapshot(submissionId: string): Promise<SubmissionSnapshot | null> {
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("submission_snapshots")
        .select("*")
        .eq("submission_id", submissionId)
        .order("submitted_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any;
        return {
          id: d.id,
          submissionId: d.submission_id,
          versionId: d.version_id,
          assignmentId: d.assignment_id,
          studentId: d.student_id ?? undefined,
          groupId: d.group_id ?? undefined,
          frozenCodeFiles: d.frozen_code_files,
          contentHash: d.content_hash,
          submittedAt: d.submitted_at,
          isLate: d.is_late,
        };
      }
    } catch {
      // Fall through
    }
  }

  return memSnapshots.get(submissionId) ?? null;
}

// ==============================================================================
// Activity Events
// ==============================================================================

export async function recordActivityEvent(input: {
  assignmentId: string;
  actorId: string;
  eventType: ActivityEventType;
  versionId?: string;
  submissionId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const admin = createAdminClient();
  if (admin) {
    try {
      const {error}=await admin.from("assignment_activity_events").insert({
        assignment_id: input.assignmentId,
        actor_id: input.actorId,
        event_type: input.eventType,
        version_id: input.versionId ?? null,
        submission_id: input.submissionId ?? null,
        metadata: input.metadata ?? {},
      });
      if(error)throw Error(error.message);
      return;
    } catch(error) {
      if(isAuthConfigured())throw error;
    }
  }
  if(isAuthConfigured())throw Error("Activity database unavailable.");
  const event: ActivityEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    assignmentId: input.assignmentId,
    actorId: input.actorId,
    eventType: input.eventType,
    versionId: input.versionId,
    submissionId: input.submissionId,
    metadata: input.metadata ?? {},
    createdAt: new Date().toISOString(),
  };
  const existing = memActivityEvents.get(input.assignmentId) ?? [];
  memActivityEvents.set(input.assignmentId, [...existing, event]);
}

export async function listActivityEvents(
  assignmentId: string,
  actorId?: string
): Promise<ActivityEvent[]> {
  const admin = createAdminClient();
  if (admin) {
    try {
      let q = admin
        .from("assignment_activity_events")
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: false });
      if (actorId) q = q.eq("actor_id", actorId);
      const { data, error } = await q;
      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (data as any[]).map((d) => ({
          id: d.id as string,
          assignmentId: d.assignment_id as string,
          actorId: d.actor_id as string,
          eventType: d.event_type as ActivityEventType,
          versionId: (d.version_id as string | null) ?? undefined,
          submissionId: (d.submission_id as string | null) ?? undefined,
          metadata: (d.metadata as Record<string, unknown>) ?? {},
          createdAt: d.created_at as string,
        }));
      }
      if(error&&isAuthConfigured())throw Error(error.message);
    } catch(error) {
      if(isAuthConfigured())throw error;
    }
  }

  if(isAuthConfigured())throw Error("Activity database unavailable.");
  const all = memActivityEvents.get(assignmentId) ?? [];
  return actorId ? all.filter((e) => e.actorId === actorId).reverse() : [...all].reverse();
}

// ==============================================================================
// Execution Logs
// ==============================================================================

export async function recordExecutionLog(input: {
  versionId?: string;
  submissionId?: string;
  assignmentId: string;
  actorId: string;
  language: string;
  stdin: string;
  result: SandboxResult;
  publicTestsPassed?: number;
  publicTestsTotal?: number;
  hiddenTestsPassed?: number;
  hiddenTestsTotal?: number;
  runMode: RunMode;
}): Promise<ExecutionLog> {
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("execution_logs")
        .insert({
          version_id: input.versionId ?? null,
          submission_id: input.submissionId ?? null,
          assignment_id: input.assignmentId,
          actor_id: input.actorId,
          language: input.language,
          stdin: input.stdin,
          stdout: input.result.stdout ?? null,
          stderr: input.result.stderr ?? null,
          exit_code: input.result.exitCode,
          duration_ms: input.result.durationMs,
          public_tests_passed: input.publicTestsPassed ?? null,
          public_tests_total: input.publicTestsTotal ?? null,
          hidden_tests_passed: input.hiddenTestsPassed ?? null,
          hidden_tests_total: input.hiddenTestsTotal ?? null,
          run_mode: input.runMode,
        })
        .select()
        .single();

      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any;
        return mapExecLog(d);
      }
    } catch {
      // Fall through
    }
  }

  const log: ExecutionLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    versionId: input.versionId,
    submissionId: input.submissionId,
    assignmentId: input.assignmentId,
    actorId: input.actorId,
    language: input.language,
    stdin: input.stdin,
    stdout: input.result.stdout,
    stderr: input.result.stderr,
    exitCode: input.result.exitCode,
    durationMs: input.result.durationMs,
    publicTestsPassed: input.publicTestsPassed,
    publicTestsTotal: input.publicTestsTotal,
    hiddenTestsPassed: input.hiddenTestsPassed,
    hiddenTestsTotal: input.hiddenTestsTotal,
    runMode: input.runMode,
    createdAt: new Date().toISOString(),
  };
  const existing = memExecLogs.get(input.assignmentId) ?? [];
  memExecLogs.set(input.assignmentId, [...existing, log]);
  return log;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapExecLog(d: any): ExecutionLog {
  return {
    id: d.id,
    versionId: d.version_id ?? undefined,
    submissionId: d.submission_id ?? undefined,
    assignmentId: d.assignment_id,
    actorId: d.actor_id,
    language: d.language,
    stdin: d.stdin,
    stdout: d.stdout ?? undefined,
    stderr: d.stderr ?? undefined,
    exitCode: d.exit_code ?? undefined,
    durationMs: d.duration_ms ?? undefined,
    publicTestsPassed: d.public_tests_passed ?? undefined,
    publicTestsTotal: d.public_tests_total ?? undefined,
    hiddenTestsPassed: d.hidden_tests_passed ?? undefined,
    hiddenTestsTotal: d.hidden_tests_total ?? undefined,
    runMode: d.run_mode,
    createdAt: d.created_at,
  };
}

export async function listExecutionLogs(
  assignmentId: string,
  actorId?: string,
  isTeacher = false
): Promise<StudentExecutionLog[] | ExecutionLog[]> {
  const admin = createAdminClient();
  if (admin) {
    try {
      let q = admin
        .from("execution_logs")
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (actorId) q = q.eq("actor_id", actorId);
      const { data, error } = await q;
      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const logs: ExecutionLog[] = (data as any[]).map(mapExecLog);
        return isTeacher ? logs : stripHiddenTestCounts(logs);
      }
    } catch {
      // Fall through
    }
  }

  const all = memExecLogs.get(assignmentId) ?? [];
  const filtered = actorId ? all.filter((l) => l.actorId === actorId) : all;
  return isTeacher ? [...filtered].reverse() : stripHiddenTestCounts([...filtered].reverse());
}

/** PRIVACY: Strip hidden test pass/fail counts from logs returned to students */
function stripHiddenTestCounts(logs: ExecutionLog[]): StudentExecutionLog[] {
  return logs.map((log) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { hiddenTestsPassed, hiddenTestsTotal, ...safe } = log;
    return safe;
  });
}

// ==============================================================================
// Code Diffs (computed in-memory, never stored)
// ==============================================================================

/**
 * Computes a simple line-level diff between two code versions.
 * This is a pure server-side utility; no untrusted code runs.
 */
export function computeVersionDiff(from: CodeVersion, to: CodeVersion): VersionDiff {
  const allFiles = new Set([...Object.keys(from.codeFiles), ...Object.keys(to.codeFiles)]);
  const fileDiffs: CodeFileDiff[] = [];

  for (const fileName of allFiles) {
    const fromLines = (from.codeFiles[fileName] ?? "").split("\n");
    const toLines = (to.codeFiles[fileName] ?? "").split("\n");
    const hunks = computeLineDiff(fromLines, toLines);
    const addedLines = hunks.filter((h) => h.type === "insert").reduce((s, h) => s + h.lines.length, 0);
    const removedLines = hunks.filter((h) => h.type === "delete").reduce((s, h) => s + h.lines.length, 0);
    fileDiffs.push({ fileName, hunks, addedLines, removedLines });
  }

  const totalAdded = fileDiffs.reduce((s, f) => s + f.addedLines, 0);
  const totalRemoved = fileDiffs.reduce((s, f) => s + f.removedLines, 0);

  return {
    fromVersionId: from.id,
    toVersionId: to.id,
    fileDiffs,
    summary: `+${totalAdded} / -${totalRemoved} lines across ${fileDiffs.length} file(s)`,
  };
}

/** Minimal Myers-style LCS diff producing equal/insert/delete hunks */
function computeLineDiff(fromLines: string[], toLines: string[]): DiffHunk[] {
  const m = fromLines.length;
  const n = toLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (fromLines[i] === toLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Trace back
  const hunks: DiffHunk[] = [];
  let i = 0;
  let j = 0;

  const addHunk = (type: DiffHunk["type"], line: string) => {
    const last = hunks[hunks.length - 1];
    if (last?.type === type) {
      last.lines.push(line);
    } else {
      hunks.push({ type, lines: [line] });
    }
  };

  while (i < m || j < n) {
    if (i < m && j < n && fromLines[i] === toLines[j]) {
      addHunk("equal", fromLines[i]);
      i++;
      j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      addHunk("insert", toLines[j]);
      j++;
    } else {
      addHunk("delete", fromLines[i]);
      i++;
    }
  }

  return hunks;
}
