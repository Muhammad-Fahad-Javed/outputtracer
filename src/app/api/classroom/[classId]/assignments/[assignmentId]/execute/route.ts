/**
 * POST /api/classroom/[classId]/assignments/[assignmentId]/execute
 *
 * Executes student code through the isolated sandbox.
 * Runs public test cases and returns results.
 * Hidden test cases are NEVER run here — only in auto-grade.
 *
 * SECURITY:
 * - Student must be enrolled in the classroom.
 * - Code runs via executionClient (sandboxed, never in-process eval).
 * - Hidden test definitions are never fetched or sent to the client.
 * - Rate-limited at the classroom assignment level.
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { globalRateLimiter, clientIpFromForwarded } from "@/lib/rateLimit";
import {
  assignmentBelongsToClassroom,
  callerCanUseGroup,
  getClassroom,
} from "@/lib/classroom/classroomService";
import { runInSandboxSafe } from "@/lib/classroom/executionClient";
import { runTestCase } from "@/lib/classroom/executionClient";
import {
  saveCodeVersion,
  recordActivityEvent,
  recordExecutionLog,
} from "@/lib/classroom/versioningService";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AssignmentTestCase } from "@/lib/classroom/types";
import { inspectSourceFiles } from "@/lib/sourceFiles";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const { classId, assignmentId } = await params;

  // Rate limit: 30 runs per minute per IP
  const ip = clientIpFromForwarded(
    request.headers.get("x-forwarded-for") ?? undefined,
    undefined,
    process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true"
  );
  const limited = globalRateLimiter.check(`classroom-exec:${ip}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { success: false, error: `Rate limit exceeded. Try again in ${limited.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const access = await getClassroom(user.id, classId);
  if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: 403 });

  if (!(await assignmentBelongsToClassroom(classId, assignmentId))) {
    return NextResponse.json({ success: false, error: "Assignment not found." }, { status: 404 });
  }

  let body: { codeFiles?: unknown; stdin?: string; language?: string; runTests?: boolean; groupId?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.codeFiles || typeof body.codeFiles !== "object") {
    return NextResponse.json({ success: false, error: "codeFiles is required." }, { status: 400 });
  }

  const files = body.codeFiles as Record<string, string>;
  const inspected = inspectSourceFiles(files, { maxFiles: 16, maxSourceBytes: 200 * 1024 });
  if (!inspected.ok) {
    return NextResponse.json({ success: false, error: inspected.message }, { status: 400 });
  }
  const language = typeof body.language === "string" ? body.language : "cpp";
  const stdin = typeof body.stdin === "string" ? body.stdin : "";
  const groupId = typeof body.groupId === "string" ? body.groupId : undefined;
  if (groupId && !(await callerCanUseGroup(user.id, classId, groupId))) {
    return NextResponse.json({ success: false, error: "You are not a member of that group." }, { status: 403 });
  }

  // Save a version for this run
  const version = await saveCodeVersion({
    assignmentId,
    codeFiles: files,
    language,
    studentId: groupId ? undefined : user.id,
    groupId,
  });

  // Execute code in sandbox
  let sandboxResult;
  try {
    sandboxResult = await runInSandboxSafe({ files, stdin, language });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Optionally run public test cases
  const testResults: Array<{ id: string; name: string; passed: boolean; actualOutput: string; durationMs: number }> = [];
  let publicPassed = 0;

  if (body.runTests) {
    // Fetch ONLY public test cases — hidden test cases never fetched here
    const admin = createAdminClient();
    if (admin) {
      try {
        const { data } = await admin
          .from("classroom_assignments")
          .select("public_test_cases")
          .eq("id", assignmentId)
          .single();

        if (data?.public_test_cases) {
          const publicTests = data.public_test_cases as AssignmentTestCase[];
          for (const tc of publicTests) {
            const result = await runTestCase(files, language, tc.stdin, tc.expectedOutput);
            if (result.passed) publicPassed++;
            testResults.push({ id: tc.id, name: tc.name, passed: result.passed, actualOutput: result.actualOutput, durationMs: result.durationMs });
          }
        }
      } catch {
        // Non-fatal — return run result without test results
      }
    }
  }

  // Record execution log
  await recordExecutionLog({
    versionId: version.id,
    assignmentId,
    actorId: user.id,
    language,
    stdin,
    result: sandboxResult,
    publicTestsPassed: body.runTests ? publicPassed : undefined,
    publicTestsTotal: body.runTests ? testResults.length : undefined,
    runMode: "manual",
  });

  // Record run activity
  void recordActivityEvent({
    assignmentId,
    actorId: user.id,
    eventType: "run",
    versionId: version.id,
    metadata: { exitCode: sandboxResult.exitCode, durationMs: sandboxResult.durationMs },
  });

  return NextResponse.json({
    success: true,
    output: sandboxResult.stdout,
    stderr: sandboxResult.stderr,
    exitCode: sandboxResult.exitCode,
    durationMs: sandboxResult.durationMs,
    timedOut: sandboxResult.timedOut,
    compilationError: sandboxResult.compilationError,
    testResults: body.runTests ? testResults : undefined,
    versionId: version.id,
  });
}
