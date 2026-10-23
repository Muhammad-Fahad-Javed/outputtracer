import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: vi.fn() })), client: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
import { createClient } from "./server";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("request-scoped authentication", () => {
  it("accesses cookies even without build-time configuration to prevent cached anonymous pages", async () => {
    for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) vi.stubEnv(key, "");
    expect(await createClient()).toBeNull();
    expect(mocks.cookies).toHaveBeenCalledOnce();
    expect(mocks.client).not.toHaveBeenCalled();
  });
});
