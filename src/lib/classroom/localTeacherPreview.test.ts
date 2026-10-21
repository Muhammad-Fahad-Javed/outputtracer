import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/classroom/route";
import { _resetClassroomMemory } from "./classroomService";
import {
  _resetLocalTeacherPreview,
  ensureLocalPreviewTeacher,
  localTeacherPreviewEnabled,
} from "./localTeacherPreview";
import { _resetMemoryStores, checkIsVerifiedTeacher } from "./roles";

describe("local teacher preview", () => {
  beforeEach(() => {
    _resetMemoryStores();
    _resetClassroomMemory();
    _resetLocalTeacherPreview();
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("ADMIN_USER_IDS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stays off in production when Supabase is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(localTeacherPreviewEnabled()).toBe(false);
    expect(await ensureLocalPreviewTeacher()).toBeNull();

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("stays off in development once Supabase credentials exist", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key");
    expect(localTeacherPreviewEnabled()).toBe(false);
    expect(await ensureLocalPreviewTeacher()).toBeNull();
  });

  it("opens the teacher hub on this machine when accounts are not configured", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.localPreview).toBe(true);
    expect(body.capabilities.canCreateClassroom).toBe(true);
    expect(body.capabilities.isVerifiedTeacher).toBe(true);
    expect(body.teaching).toHaveLength(1);
    expect(body.teaching[0].name).toBe("CS106B Programming Abstractions");
    expect(await checkIsVerifiedTeacher("someone-else")).toBe(false);
  });
});
