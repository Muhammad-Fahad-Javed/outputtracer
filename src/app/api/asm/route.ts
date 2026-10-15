import { NextResponse } from "next/server";
import { sessionManager } from "@/lib/asm/session";
import { clientIpFromForwarded, globalRateLimiter } from "@/lib/rateLimit";

const MAX_ASM_SOURCE_BYTES = 64 * 1024; // 64 KB

export async function POST(request: Request) {
  const ip = clientIpFromForwarded(
    request.headers.get("x-forwarded-for") ?? undefined,
    undefined,
    process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true"
  );

  const limited = globalRateLimiter.check(`asm:${ip}`, 120, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      {
        success: false,
        error: `Rate limit exceeded. Try again in ${limited.retryAfterSec}s.`,
      },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  let body: {
    action?: string;
    sessionId?: string;
    source?: string;
    stdin?: string;
    limit?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const { action = "assemble", sessionId, source, stdin, limit } = body;

  if (source && typeof source === "string" && Buffer.byteLength(source, "utf8") > MAX_ASM_SOURCE_BYTES) {
    return NextResponse.json(
      { success: false, error: "Source code exceeds maximum allowed size (64 KB)." },
      { status: 413 }
    );
  }

  try {
    let session = sessionId ? sessionManager.getSession(sessionId) : undefined;

    if (action === "create" || (action === "assemble" && !session)) {
      if (typeof source !== "string") {
        return NextResponse.json(
          { success: false, error: "Missing source code." },
          { status: 400 }
        );
      }
      session = sessionManager.createSession({
        source,
        stdin: stdin || "",
      });
      const assembleResult = await session.assemble();
      const status = session.getStatus();

      return NextResponse.json({
        success: assembleResult.success,
        sessionId: session.id,
        assembleResult: {
          success: assembleResult.success,
          diagnostics: assembleResult.diagnostics,
          entryPoint: assembleResult.entryPoint,
          loadAddress: assembleResult.loadAddress,
          engineUsed: assembleResult.engineUsed,
          binaryLength: assembleResult.binary.length,
        },
        status,
      });
    }

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found or expired. Please re-assemble." },
        { status: 404 }
      );
    }

    // Existing session actions
    switch (action) {
      case "assemble": {
        if (typeof source === "string") {
          session.source = source;
        }
        if (typeof stdin === "string") {
          session.cpu.stdinBuffer = stdin;
        }
        const assembleResult = await session.assemble();
        const status = session.getStatus();
        return NextResponse.json({
          success: assembleResult.success,
          sessionId: session.id,
          assembleResult: {
            success: assembleResult.success,
            diagnostics: assembleResult.diagnostics,
            entryPoint: assembleResult.entryPoint,
            loadAddress: assembleResult.loadAddress,
            engineUsed: assembleResult.engineUsed,
            binaryLength: assembleResult.binary.length,
          },
          status,
        });
      }

      case "step": {
        const step = session.step();
        const status = session.getStatus();
        return NextResponse.json({
          success: true,
          sessionId: session.id,
          step,
          status,
        });
      }

      case "stepBack": {
        const ok = session.stepBack();
        const status = session.getStatus();
        return NextResponse.json({
          success: ok,
          sessionId: session.id,
          status,
        });
      }

      case "run": {
        const steps = session.run(limit || 2000);
        const status = session.getStatus();
        return NextResponse.json({
          success: true,
          sessionId: session.id,
          steps,
          status,
        });
      }

      case "reset": {
        session.reset();
        const status = session.getStatus();
        return NextResponse.json({
          success: true,
          sessionId: session.id,
          status,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
