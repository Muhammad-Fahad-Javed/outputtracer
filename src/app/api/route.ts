import { NextResponse } from "next/server";
import { checkCompilerAvailable } from "@/lib/cppRunner";

// Lightweight health check: confirms the server is up AND that the C++
// compiler it depends on is actually reachable. A load balancer / uptime
// monitor should hit this rather than assuming the process being alive
// means code execution works.
export async function GET() {
  const compiler = await checkCompilerAvailable();

  return NextResponse.json(
    {
      status: compiler.available ? "ok" : "degraded",
      compiler: {
        available: compiler.available,
        version: compiler.version || null,
      },
      time: new Date().toISOString(),
    },
    { status: compiler.available ? 200 : 503 }
  );
}
