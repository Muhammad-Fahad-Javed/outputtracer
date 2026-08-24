import { NextResponse } from "next/server";
import { compileAndRun, RunStatus } from "@/lib/cppRunner";

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

  const { source, stdin, standard } =
    (body as { source?: unknown; stdin?: unknown; standard?: unknown }) ?? {};

  const result = await compileAndRun({
    source: typeof source === "string" ? source : "",
    stdin: typeof stdin === "string" ? stdin : undefined,
    standard: typeof standard === "string" ? standard : undefined,
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
