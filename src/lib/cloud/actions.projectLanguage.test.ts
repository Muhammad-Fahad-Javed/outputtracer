import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "student" } } }) }, rpc: mocks.rpc }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { createProject } from "./actions";
import { PROJECT_LANGUAGES } from "./projectLanguage";

function form(values: Record<string, string>): FormData { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }

beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: "new-project", error: null }); });

describe("create project server action", () => {
  it.each(["cpp", "python", "asm8086"] as const)("saves %s with the matching canonical starter", async (language) => {
    await expect(createProject(null, form({ title: "My project", language, standard: "c++20" }))).rejects.toThrow("redirect:/p/new-project");
    expect(mocks.rpc).toHaveBeenCalledWith("create_project", { p_title: "My project", p_language: language, p_standard: language === "cpp" ? "c++20" : null, p_group: null, p_main: PROJECT_LANGUAGES[language].starter });
  });
  it("keeps old forms working as C++", async () => {
    await expect(createProject(null, form({ title: "Legacy form" }))).rejects.toThrow("redirect:/p/new-project");
    expect(mocks.rpc).toHaveBeenCalledWith("create_project", expect.objectContaining({ p_language: "cpp", p_standard: "c++17" }));
  });
  it("rejects malformed language, group and C++ standard before creating rows", async () => {
    expect(await createProject(null, form({ language: "javascript" }))).toEqual({ error: "Choose C++, Python or 8086 Assembly." });
    expect(await createProject(null, form({ language: "cpp", standard: "javascript" }))).toEqual({ error: "Choose a supported C++ standard." });
    expect(await createProject(null, form({ language: "python", groupId: "not-a-group" }))).toEqual({ error: "Choose a valid group." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("reports database failure without redirecting to an unsaved project", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Project storage unavailable" } });
    expect(await createProject(null, form({ language: "python" }))).toEqual({ error: "Project storage unavailable" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
