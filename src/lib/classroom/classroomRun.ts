import * as Y from "yjs";
import { applyEncoded } from "@/lib/cloud/collabDoc";
import { inspectDosboxAssets, type DosboxAssets } from "@/lib/dosboxAssets";
import { getHub } from "@/lib/cloud/collabHub";
import { inspectSourceFiles } from "@/lib/sourceFiles";
import {
  classroomExecutionRequest,
  studentEditDenial,
  studentRunDenial,
} from "./assignmentPolicy";
import {
  chooseCanonicalFiles,
  readClassroomDocument,
  resolveClassroomDocument,
} from "./documents";
import { runInSandboxSafe, runTestCase } from "./executionClient";
import { recordActivityEvent, recordExecutionLog, saveCodeVersion } from "./versioningService";

export async function loadCanonicalClassroomFiles(doc: {
  docKey: string;
  starterCode: Record<string, string>;
}): Promise<Record<string, string>> {
  const live = getHub().peekClassroomFiles(doc.docKey);
  const stored = await readClassroomDocument(doc.docKey);
  return chooseCanonicalFiles(live, stored?.files, doc.starterCode);
}

/** Capture source and input files from the same canonical shared revision. */
export async function loadCanonicalClassroomProject(doc: {
  docKey: string;
  starterCode: Record<string, string>;
}): Promise<{ files: Record<string, string>; inputAssets: DosboxAssets }> {
  const hub = getHub();
  // Both reads are synchronous: no document updates can interleave them.
  const live = hub.peekClassroomFiles(doc.docKey);
  const liveAssets = hub.peekClassroomAssets(doc.docKey);
  if (live) return { files: { ...live }, inputAssets: JSON.parse(JSON.stringify(liveAssets ?? {})) as DosboxAssets };
  const stored = await readClassroomDocument(doc.docKey);
  let inputAssets: DosboxAssets = {};
  if (stored?.stateB64) {
    const state = new Y.Doc();
    try {
      applyEncoded(state, stored.stateB64, "snapshot");
      const assets = state.getMap("dosAssets").toJSON();
      const inspected = inspectDosboxAssets(assets);
      if (!inspected.ok) throw new Error(inspected.message);
      inputAssets = assets as DosboxAssets;
    } finally { state.destroy(); }
  }
  return { files: chooseCanonicalFiles(null, stored?.files, doc.starterCode), inputAssets };
}

/**
 * Compile and run the shared document. Hidden tests are never loaded.
 * Students are refused when the assignment is frozen or running is off.
 * Teachers can run either way. Trace is not requested.
 */
export async function executeResolvedClassroom(input: {
  actorId: string;
  isTeacher: boolean;
  classroomId: string;
  assignmentId: string;
  groupId?: string;
  studentId?: string;
  runTests?: boolean;
  stdin?: string;
  now?: number;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const resolved = await resolveClassroomDocument({
    actorId: input.actorId,
    classroomId: input.classroomId,
    assignmentId: input.assignmentId,
    isTeacher: input.isTeacher,
    groupId: input.groupId,
    studentId: input.studentId,
    now: input.now,
  });
  if (!resolved.ok) {
    return { status: resolved.status, body: { success: false, error: resolved.error, code: resolved.code } };
  }

  const denial = studentRunDenial(resolved.doc, input.isTeacher);
  if (denial) {
    return { status: denial.status, body: { success: false, error: denial.error, code: denial.code } };
  }

  if (resolved.doc.language === "asm8086") {
    return { status: 409, body: { success: false, code: "browser_execution_required", error: "Assembly projects run in your browser DOSBox console. Server public tests are unavailable; submitted work is reviewed by your teacher." } };
  }

  const files = await loadCanonicalClassroomFiles(resolved.doc);
  const inspected = inspectSourceFiles(files, { maxFiles: 16, maxSourceBytes: 200 * 1024 }, resolved.doc.language);
  if (!inspected.ok) {
    return { status: 400, body: { success: false, error: inspected.message } };
  }

  const request = classroomExecutionRequest(files, resolved.doc.timeLimitMs, input.stdin ?? "", resolved.doc.language);
  const version = await saveCodeVersion({
    assignmentId: input.assignmentId,
    codeFiles: files,
    language: resolved.doc.language,
    studentId: resolved.doc.groupId ? undefined : resolved.doc.studentId,
    groupId: resolved.doc.groupId,
  });

  let sandboxResult;
  try {
    sandboxResult = await runInSandboxSafe(request);
  } catch (err: unknown) {
    const error = err as Error;
    return { status: 500, body: { success: false, error: error.message } };
  }

  const testResults: Array<{ id: string; name: string; passed: boolean; actualOutput: string; durationMs: number }> = [];
  let publicPassed = 0;
  if (input.runTests) {
    for (const test of resolved.doc.publicTestCases) {
      const result = await runTestCase(files, resolved.doc.language, test.stdin, test.expectedOutput, request.timeLimitMs);
      if (result.passed) publicPassed += 1;
      testResults.push({
        id: test.id,
        name: test.name,
        passed: result.passed,
        actualOutput: result.actualOutput,
        durationMs: result.durationMs,
      });
    }
  }

  await recordExecutionLog({
    versionId: version.id,
    assignmentId: input.assignmentId,
    actorId: input.actorId,
    language: resolved.doc.language,
    stdin: request.stdin,
    result: sandboxResult,
    publicTestsPassed: input.runTests ? publicPassed : undefined,
    publicTestsTotal: input.runTests ? testResults.length : undefined,
    runMode: "manual",
  });

  void recordActivityEvent({
    assignmentId: input.assignmentId,
    actorId: input.actorId,
    eventType: "run",
    versionId: version.id,
    metadata: { exitCode: sandboxResult.exitCode, durationMs: sandboxResult.durationMs },
  });

  return {
    status: 200,
    body: {
      success: true,
      output: sandboxResult.stdout,
      machine: sandboxResult.machine,
      stderr: sandboxResult.stderr,
      exitCode: sandboxResult.exitCode,
      durationMs: sandboxResult.durationMs,
      timedOut: sandboxResult.timedOut,
      compilationError: sandboxResult.compilationError,
      testResults: input.runTests ? testResults : undefined,
      versionId: version.id,
      groupId: resolved.doc.groupId,
      studentId: resolved.doc.studentId,
    },
  };
}

export function submissionFrozenDenial(doc: { frozen: boolean; freezeReason?: string }) {
  return studentEditDenial(doc);
}
