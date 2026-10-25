import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { WebSocket } from "ws";
import { applyEncoded, encodeDoc, readFiles, seedDoc } from "./collabDoc";
import { readDosboxAssets } from "@/lib/dosboxAssets";

const fixture = vi.hoisted(() => ({
  projects: new Map<string, { language: string; standard: string | null }>(),
  documents: new Map<string, string>(),
  files: new Map<string, Record<string, string>>(),
  role: "editor" as "editor" | "viewer" | null,
}));

vi.mock("./accessToken", () => ({ accessFromToken: vi.fn(async () => fixture.role ? { userId: "student", role: fixture.role } : null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  from(table: string) {
    let id = "";
    let changes: Record<string, unknown> | null = null;
    const response = () => {
      if (table === "projects") {
        if (changes && fixture.projects.has(id)) Object.assign(fixture.projects.get(id)!, changes);
        return { data: fixture.projects.get(id) ?? null, error: null };
      }
      if (table === "project_documents") return { data: fixture.documents.has(id) ? { state_b64: fixture.documents.get(id) } : null, error: null };
      return { data: Object.entries(fixture.files.get(id) ?? {}).map(([path, content]) => ({ path, content })), error: null };
    };
    const query = {
      select: () => query,
      eq: (_field: string, value: string) => { id = value; return query; },
      maybeSingle: async () => response(),
      then: (resolve: (value: ReturnType<typeof response>) => unknown) => Promise.resolve(response()).then(resolve),
      update: (value: Record<string, unknown>) => { changes = value; return query; },
      delete: () => query,
      in: async () => ({ error: null }),
      async upsert(value: Record<string, unknown> | Array<Record<string, unknown>>) {
        if (table === "project_documents" && !Array.isArray(value)) fixture.documents.set(String(value.project_id), String(value.state_b64));
        if (table === "project_files" && Array.isArray(value)) {
          for (const row of value) fixture.files.set(String(row.project_id), { ...fixture.files.get(String(row.project_id)), [String(row.path)]: String(row.content) });
        }
        return { error: null };
      },
    };
    return query;
  },
}) }));

import { getHub, projectDocumentIsValid } from "./collabHub";
import type { ProjectLanguage } from "./projectLanguage";
import { accessFromToken } from "./accessToken";

const projectId = "4ad6c56f-ce86-48a1-9d50-7474ac5afaf7";
type Message = { type: string; [key: string]: unknown };
const sockets: ReturnType<typeof fakeSocket>[] = [];
function fakeSocket() {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    OPEN: 1, readyState: 1, sent: [] as Message[],
    send(value: string) { this.sent.push(JSON.parse(value)); },
    close() { if (this.readyState === 3) return; this.readyState = 3; this.emit("close"); },
    on(type: string, fn: (...args: unknown[]) => void) { (handlers[type] ||= []).push(fn); },
    emit(type: string, ...args: unknown[]) { for (const fn of handlers[type] || []) fn(...args); },
  };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
async function open(language: ProjectLanguage = "asm8086") {
  fixture.projects.set(projectId, { language, standard: language === "cpp" ? "c++17" : null });
  const ws = fakeSocket(); sockets.push(ws);
  getHub().attach(ws as unknown as WebSocket);
  ws.emit("message", JSON.stringify({ type: "join", projectId, token: "token", clientId: 17 }));
  for (let n = 0; n < 30 && !ws.sent.some((value) => value.type === "init"); n++) await tick();
  expect(ws.sent.some((value) => value.type === "init")).toBe(true);
  return ws;
}
async function send(ws: ReturnType<typeof fakeSocket>, message: Message) { ws.emit("message", JSON.stringify(message)); await tick(); }
function update(ws: ReturnType<typeof fakeSocket>, edit: (doc: Y.Doc) => void): string {
  const doc = new Y.Doc();
  applyEncoded(doc, String(ws.sent.find((value) => value.type === "init")!.state));
  edit(doc);
  const state = encodeDoc(doc); doc.destroy(); return state;
}

describe("language-aware saved project collaboration", () => {
  beforeEach(() => { vi.clearAllMocks(); getHub().closeAllForTests(); fixture.projects.clear(); fixture.documents.clear(); fixture.files.clear(); fixture.role = "editor"; });
  afterEach(async () => { for (const ws of sockets.splice(0)) ws.close(); await tick(); getHub().closeAllForTests(); });

  it.each(["cpp", "python", "asm8086"] as const)("seeds and broadcasts the canonical %s language", async (language) => {
    const ws = await open(language);
    expect(ws.sent.find((message) => message.type === "init")?.language).toBe(language);
    const project = await getHub().readFiles(projectId);
    expect(project.language).toBe(language);
    expect(Object.keys(project.files)).toEqual([language === "cpp" ? "main.cpp" : language === "python" ? "main.py" : "main.asm"]);
    expect(project.standard).toBe(language === "cpp" ? "c++17" : null);
  });

  it("accepts Python edits and rejects C++ files or loss of the Python entry", async () => {
    const ws = await open("python");
    await send(ws, { type: "update", update: update(ws, (doc) => doc.getMap<Y.Text>("files").get("main.py")!.insert(0, "# saved\n")) });
    expect((await getHub().readFiles(projectId)).files["main.py"]).toContain("# saved");
    await send(ws, { type: "file-create", name: "oops.cpp", content: "" });
    await send(ws, { type: "file-delete", name: "main.py" });
    expect(Object.keys((await getHub().readFiles(projectId)).files)).toEqual(["main.py"]);
    expect(ws.sent.filter((message) => message.type === "error")).toHaveLength(2);
  });

  it("saves validated binary assets in a cloud project's persisted Yjs state", async () => {
    const ws = await open();
    await send(ws, { type: "asset-upload", name: "INPUT.BIN", base64: "AP+A" });
    expect((await getHub().readFiles(projectId)).assets).toEqual({ "INPUT.BIN": { base64: "AP+A" } });
    const state = String(ws.sent.find((message) => message.type === "init")!.state);
    await getHub().ingestSnapshot(projectId, state);
    const saved = new Y.Doc(); applyEncoded(saved, fixture.documents.get(projectId)!);
    expect(readDosboxAssets(saved)).toEqual({ "INPUT.BIN": { base64: "AP+A" } });
    saved.destroy();
    await send(ws, { type: "asset-delete", name: "INPUT.BIN" });
    expect((await getHub().readFiles(projectId)).assets).toEqual({});
  });

  it("blocks asset writes through raw websocket or REST state updates", async () => {
    const ws = await open();
    const forged = update(ws, (doc) => doc.getMap("dosAssets").set("INPUT.BIN", { base64: "AP+A" }));
    await send(ws, { type: "update", update: forged });
    await expect(getHub().ingestSnapshot(projectId, forged)).rejects.toThrow(/upload/i);
    expect((await getHub().readFiles(projectId)).assets).toEqual({});
    await send(ws, { type: "asset-upload", name: "EVIL.EXE", base64: "AA==" });
    expect((await getHub().readFiles(projectId)).assets).toEqual({});
  });

  it("revalidates edits immediately after project permission revocation", async () => {
    const ws = await open(); fixture.role = "viewer";
    await send(ws, { type: "asset-upload", name: "INPUT.BIN", base64: "AA==" });
    expect((await getHub().readFiles(projectId)).assets).toEqual({});
    expect(ws.readyState).toBe(3);
  });

  it("validates typing locally without querying project authorization on every edit", async () => {
    const ws = await open("python");
    const joinChecks = vi.mocked(accessFromToken).mock.calls.length;
    for (let n = 0; n < 3; n++) {
      await send(ws, { type: "update", update: update(ws, (doc) => doc.getMap<Y.Text>("files").get("main.py")!.insert(0, `# edit ${n}\n`)) });
    }
    expect((await getHub().readFiles(projectId)).files["main.py"]).toContain("# edit 2");
    expect(vi.mocked(accessFromToken)).toHaveBeenCalledTimes(joinChecks);
  });

  it("rechecks permission for raw Yjs file creation, preserving the fast path for typing", async () => {
    const ws = await open("python");
    fixture.role = "viewer";
    await send(ws, { type: "update", update: update(ws, (doc) => { const file = new Y.Text(); file.insert(0, "answer = 42\n"); doc.getMap("files").set("helper.py", file); }) });
    expect((await getHub().readFiles(projectId)).files).not.toHaveProperty("helper.py");
    expect(ws.readyState).toBe(3);
  });

  it.each([null, "viewer"] as const)("closes typing sessions when a periodic audit finds access changed to %s", async (role) => {
    vi.useFakeTimers();
    try {
      const opening = open();
      await vi.advanceTimersByTimeAsync(20);
      const ws = await opening;
      const joinChecks = vi.mocked(accessFromToken).mock.calls.length;
      fixture.role = role;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(vi.mocked(accessFromToken)).toHaveBeenCalledTimes(joinChecks + 1);
      expect(ws.readyState).toBe(3);
    } finally { vi.useRealTimers(); }
  });

  it("does not allow viewers to upload or delete shared files", async () => {
    fixture.role = "viewer";
    const ws = await open();
    await send(ws, { type: "asset-upload", name: "INPUT.BIN", base64: "AA==" });
    await send(ws, { type: "file-create", name: "OTHER.ASM" });
    expect((await getHub().readFiles(projectId)).assets).toEqual({});
    expect(Object.keys((await getHub().readFiles(projectId)).files)).toEqual(["main.asm"]);
  });

  it("rejects compiler standards for NASM and does not alter the document", async () => {
    const ws = await open();
    await expect(getHub().ingestSnapshot(projectId, String(ws.sent.find((value) => value.type === "init")!.state), "c++17")).rejects.toThrow(/C\+\+/);
    expect((await getHub().readFiles(projectId)).standard).toBeNull();
  });

  it("rejects case-colliding DOS sources and non-text/embedded source data", () => {
    const doc = new Y.Doc(); seedDoc(doc, { "main.asm": "org 100h", "MAIN.ASM": "org 0" });
    expect(projectDocumentIsValid(doc, "asm8086")).toBe(false);
    doc.destroy();
    const broken = new Y.Doc(); broken.getMap("files").set("main.py", "not a Y.Text");
    expect(projectDocumentIsValid(broken, "python")).toBe(false);
    broken.destroy();
  });

  it("round-trips source and input assets together without turning assets into source files", async () => {
    const ws = await open();
    await send(ws, { type: "asset-upload", name: "DATA.TXT", base64: "aGk=" });
    const saved = new Y.Doc(); applyEncoded(saved, String(ws.sent.find((value) => value.type === "init")!.state));
    for (const message of ws.sent.filter((value) => value.type === "update")) applyEncoded(saved, String(message.update));
    saved.getMap<Y.Text>("files").get("main.asm")!.insert(0, "; offline edit\n");
    await getHub().ingestSnapshot(projectId, encodeDoc(saved));
    expect(readFiles(saved)).not.toHaveProperty("DATA.TXT");
    expect((await getHub().readFiles(projectId)).files["main.asm"]).toContain("offline edit");
    expect((await getHub().readFiles(projectId)).assets).toEqual({ "DATA.TXT": { base64: "aGk=" } });
    saved.destroy();
  });
});
