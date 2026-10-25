import { NextResponse } from "next/server";
import { accessFromCookies } from "@/lib/cloud/accessSession";
import { getHub } from "@/lib/cloud/collabHub";
import { canEdit, isUuid } from "@/lib/cloud/roles";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const access = await accessFromCookies(id);
  if (!access || !canEdit(access.role)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  let body: { state?: unknown; standard?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body) ||
    typeof body.state !== "string" || body.state.length === 0 || body.state.length > 3_000_000 ||
    (body.standard !== undefined && body.standard !== null && typeof body.standard !== "string")) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    await getHub().ingestSnapshot(
      id,
      body.state,
      typeof body.standard === "string" ? body.standard : undefined
    );
  } catch (error) {
    const err = error as Error;
    return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
