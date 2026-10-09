import { NextResponse } from "next/server";
import { compileAndRun, RunStatus } from "@/lib/cppRunner";
import { execConfig } from "@/lib/execConfig";
import { clientIpFromForwarded, globalRateLimiter } from "@/lib/rateLimit";
import { accessFromCookies } from "@/lib/cloud/accessSession";
import { getHub } from "@/lib/cloud/collabHub";
import { canEdit } from "@/lib/cloud/roles";

// Only accept plausible JSON bodies before we even try to parse them.
const MAX_BODY_BYTES = 512 * 1024; // 512 KB — comfortably above maxSourceBytes + maxStdinBytes

// Maps the internal, fine-grained run status to the public `status` field
// the existing frontend understands ("success" | "error"), while still
// exposing the fine-grained reason via `error.kind` for clients that want
// it and via the HTTP status code.
function toHttpStatus(status: RunStatus): number {
  switch (status) {
    case "success":
      return 200;
    case "invalid_request":
      return 400;
    case "busy":
      return 503;
    case "server_error":
      return 500;
    default:
      // compile_error, compile_timeout, runtime_error, timeout, output_limit
      // are all well-formed, expected outcomes of running untrusted code —
      // not server failures — so they're still a 200 with status:"error".
      return 200;
  }
}

export async function POST(request: Request) {
  const ip = clientIpFromForwarded(
    request.headers.get("x-forwarded-for") ?? undefined,
    undefined,
    process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true"
  );
  const limited = globalRateLimiter.check(
    `predict:${ip}`,
    execConfig.rateLimitPredictMax,
    execConfig.rateLimitPredictWindowMs
  );
  if (!limited.ok) {
    return NextResponse.json(
      {
        status: "error",
        error: {
          kind: "rate_limited",
          title: "Too many requests",
          message: `Slow down. Try again in ${limited.retryAfterSec}s.`,
        },
      },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      }
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        status: "error",
        error: {
          kind: "invalid_request",
          title: "Request too large",
          message: "The request body is too large.",
        },
      },
      { status: 413 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        status: "error",
        error: { kind: "invalid_request", title: "Invalid request", message: "Malformed JSON body." },
      },
      { status: 400 }
    );
  }

  const { source, files, stdin, standard, projectId } =
    (body as {
      source?: unknown;
      files?: unknown;
      stdin?: unknown;
      standard?: unknown;
      projectId?: unknown;
    }) ?? {};

  const isValidFiles =
    typeof files === "object" &&
    files !== null &&
    Object.values(files).every((v) => typeof v === "string");

  let runFiles = isValidFiles ? (files as Record<string, string>) : undefined;
  let runSource = typeof source === "string" ? source : "";
  let runStandard = typeof standard === "string" ? standard : undefined;
  let ownerKey: string | undefined;

  if (typeof projectId === "string" && projectId) {
    try {
      const access = await accessFromCookies(projectId);
      if (!access) {
        return NextResponse.json(
          {
            status: "error",
            error: {
              kind: "invalid_request",
              title: "Sign in required",
              message: "You do not have access to run this project.",
            },
          },
          { status: 403 }
        );
      }
      if (runStandard && canEdit(access.role)) {
        await getHub().setStandard(projectId, runStandard);
      }
      const shared = await getHub().readFiles(projectId);
      runFiles = shared.files;
      runSource = "";
      runStandard = shared.standard;
      ownerKey = access.userId;
    } catch (error) {
      const err = error as Error;
      return NextResponse.json(
        {
          status: "error",
          error: {
            kind: "server_error",
            title: "Project unavailable",
            message: err.message || "Could not load the shared project.",
          },
        },
        { status: 500 }
      );
    }
  }

  const result = await compileAndRun({
    files: runFiles,
    source: runSource,
    stdin: typeof stdin === "string" ? stdin : undefined,
    standard: runStandard,
    ownerKey,
  });

  if (result.status === "success") {
    // Use real GDB trace steps when available; fall back to a single
    // generic step when GDB is unavailable or produced no output.
    const traceSteps =
      result.trace && result.trace.steps.length > 0
        ? result.trace.steps
        : [
            {
              step: 1,
              statement: "Program compiled and executed",
              variables: "",
              output: result.stdout ?? "",
            },
          ];

    return NextResponse.json(
      {
        status: "success",
        output: result.stdout ?? "",
        stderr: result.stderr || undefined,
        dryRun: traceSteps,
        traceTruncated: result.trace?.truncated ?? false,
        meta: {
          exitCode: result.exitCode ?? null,
          compileTimeMs: result.compileTimeMs,
          runTimeMs: result.runTimeMs,
        },
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      status: "error",
      output: result.stdout || undefined,
      stderr: result.stderr || undefined,
      error: {
        kind: result.status,
        title: result.title || "Error",
        message: result.message || "Something went wrong.",
      },
      meta: {
        exitCode: result.exitCode ?? null,
        signal: result.signal ?? null,
        compileTimeMs: result.compileTimeMs,
        runTimeMs: result.runTimeMs,
        truncated: result.truncated,
      },
    },
    { status: toHttpStatus(result.status) }
  );
}
