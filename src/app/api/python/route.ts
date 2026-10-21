import { handlePythonRequest, methodNotAllowed } from "@/lib/python/pythonRoute";
import { runPythonCode } from "@/lib/python/pythonRunner";
import { validateRunInput } from "@/lib/python/pythonTypes";

// Node runtime: uses Buffer and talks to the sandbox worker over HTTP.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return handlePythonRequest(req, "python-run", async (body, { userId }) => {
    const input = validateRunInput(body);
    return runPythonCode(input.code, input.stdin, {}, { clientId: userId });
  });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
