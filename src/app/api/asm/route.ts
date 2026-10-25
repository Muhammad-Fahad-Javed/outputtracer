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
    sessionToken?: string;
    source?: string;
    code?: string;
    stdin?: string;
    limit?: number;
    input?: string;
    segment?: number;
    offset?: number;
    length?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const { action = "assemble", sessionId, sessionToken, stdin, limit } = body;
  const source = body.source ?? body.code;

  if (source && typeof source === "string" && Buffer.byteLength(source, "utf8") > MAX_ASM_SOURCE_BYTES) {
    return NextResponse.json(
      { success: false, error: "Source code exceeds maximum allowed size (64 KB)." },
      { status: 413 }
    );
  }

  try {
    let session = sessionId ? sessionManager.authorize(sessionId, sessionToken) : undefined;

    if(session?.scope)return NextResponse.json({error:"Use the authenticated assignment execution endpoint."},{status:403});

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
        ownerKey: ip,
      });
      const assembleResult = await session.assemble();
      const status = session.getStatus();

      return NextResponse.json({
        success: assembleResult.success,
        sessionId: session.id,
        sessionToken: session.token,
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
      case "inspect": {
        const { segment, offset, length = 128 } = body;
        if (
          typeof segment !== "number" || !Number.isInteger(segment) || segment < 0 || segment > 0xffff ||
          typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 0xffff ||
          !Number.isInteger(length) || length < 1 || length > 256
        ) {
          return NextResponse.json(
            { success: false, error: "Segment and offset must be integers from 0 to 65535; length must be from 1 to 256 bytes." },
            { status: 400 }
          );
        }
        // Inspection must not add memory reads to the next instruction's trace.
        const bytes = Array.from({ length }, (_, index) => session.cpu.readByte(segment, offset + index, false));
        return NextResponse.json({ success: true, sessionId: session.id, segment, offset, bytes });
      }

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
          sessionToken: session.token,
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

      case "input": {
        if(typeof body.input!=="string")return NextResponse.json({error:"Input text required"},{status:400});
        session.provideInput(body.input);
        await session.runUntilBlocked();
        return NextResponse.json({success:true,sessionId:session.id,status:session.getStatus(),trace:session.traceHistory});
      }
      case "stop": {
        sessionManager.deleteSession(session.id);
        return NextResponse.json({success:true});
      }
      case "run": {
        if (typeof stdin === "string" && session.executedSteps===0) {
          session.stdin = stdin;
          session.cpu.stdinBuffer = stdin;
        }
        const requested = typeof limit === "number" && Number.isFinite(limit) ? limit : 2000;
        const steps = session.run(Math.min(Math.max(1, requested), 5000));
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
