import { handlePythonRequest, methodNotAllowed } from "@/lib/python/pythonRoute";
import { tracePythonCode } from "@/lib/python/pythonTracer";
import { validateTraceInput } from "@/lib/python/pythonTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return handlePythonRequest(req, "python-trace", async (body, { userId }) => {
    const input = validateTraceInput(body);
    return tracePythonCode(input.code, input.options, { stdin: input.stdin, clientId: userId });
  });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
