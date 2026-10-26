import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { normalizeInteractiveFiles } from "../pythonFiles.mjs";
import { validateTerminalPayload, LIMITS } from "../server.mjs";
import { DEFAULT_CONFIG, INTERACTIVE_BOOTSTRAP, INTERACTIVE_READY, startInteractiveContainer } from "../dockerExec.mjs";

test("terminal accepts legacy source and bounded module snapshots", () => {
  assert.deepEqual(normalizeInteractiveFiles({ code: "print(1)" }), { "main.py": "print(1)" });
  const files = Object.fromEntries([["main.py", "é".repeat(32768)], ...Array.from({ length: 15 }, (_, i) => [`helper${i}.py`, ""])]);
  assert.deepEqual(normalizeInteractiveFiles({ files }), files);
  assert.equal(validateTerminalPayload({ files, clientId: "qa" }), null);
  const escaped = JSON.stringify({ files: { "main.py": "\u0001".repeat(65536) } });
  assert.ok(Buffer.byteLength(escaped) > LIMITS.maxBodyBytes);
  assert.ok(Buffer.byteLength(escaped) <= LIMITS.maxTerminalMessageBytes);
});

test("terminal rejects traversal, malformed files, ambiguity and aggregate UTF-8 overflow", () => {
  for (const payload of [
    null, [], { code: "pass", files: { "main.py": "pass" } },
    { files: [] }, { files: { "helper.py": "pass" } },
    ...["../escape.py", "sub/helper.py", "/tmp/helper.py", "helper.txt", "a..py"].map(name => ({ files: { "main.py": "pass", [name]: "pass" } })),
    { files: { "main.py": "pass", "helper.py": 1 } },
    { files: Object.fromEntries([["main.py", ""], ...Array.from({ length: 16 }, (_, i) => [`h${i}.py`, ""])]) },
    { files: { "main.py": "é".repeat(32768), "helper.py": "x" } },
  ]) {
    assert.throws(() => normalizeInteractiveFiles(payload));
    assert.notEqual(validateTerminalPayload(payload), null);
  }
  assert.equal(validateTerminalPayload({ files: { "main.py": "" }, clientId: 42 }), "invalid_request");
});

test("invalid source is refused before any Docker process is spawned", async () => {
  const events = [];
  const session = startInteractiveContainer({
    files: { "main.py": "pass", "../escape.py": "pass" },
    cfg: DEFAULT_CONFIG, emit: event => events.push(event),
    spawnFn() { assert.fail("invalid snapshots must not spawn Docker"); },
  });
  await session.done;
  assert.deepEqual(events.map(event => event.type), ["error"]);
});

// Execute only these fixed QA snippets to verify the actual Python bootstrap.
// Production execution continues to require Docker; this is not a host fallback.
const harness = `import shutil\ntry:\n    exec(${JSON.stringify(INTERACTIVE_BOOTSTRAP)}, globals())\nfinally:\n    if "workdir" in globals(): shutil.rmtree(workdir)\n`;
function bootstrap(files, input = "") {
  const result = spawnSync("python3", ["-I", "-u", "-c", harness], {
    input: JSON.stringify({ files }) + "\n" + input, encoding: "utf8", timeout: 5000,
    env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: "1" },
  });
  assert.ifError(result.error);
  return result;
}

test("bootstrap imports helper modules, preserves input and materializes read-only private files", () => {
  const result = bootstrap({
    "main.py": "from helper import greeting\nimport os, stat\nprint(greeting(input('Name: ')))\nprint(oct(stat.S_IMODE(os.stat('helper.py').st_mode)))\nprint(os.getcwd().startswith('/tmp/otpy-'))\n",
    "helper.py": "def greeting(name):\n    return '[' + name + ']'\n",
  }, "  Ada  \n");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, INTERACTIVE_READY + "Name: [  Ada  ]\n0o444\nTrue\n");
});

test("fresh bootstrap runs cannot inherit files created by another run", () => {
  assert.equal(bootstrap({ "main.py": "open('private.txt', 'w').write('private')" }).status, 0);
  const result = bootstrap({ "main.py": "import os\nprint(os.path.exists('private.txt'))" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, INTERACTIVE_READY + "False\n");
});

test("bootstrap retains main-file syntax diagnostics and helper-file runtime errors", () => {
  const syntax = bootstrap({ "main.py": "if" });
  assert.equal(syntax.status, 3);
  assert.equal(syntax.stdout, "");
  assert.match(syntax.stderr, /SyntaxError/);
  const helper = bootstrap({ "main.py": "import helper", "helper.py": "raise ValueError('helper failure')" });
  assert.equal(helper.status, 1);
  assert.equal(helper.stdout, INTERACTIVE_READY);
  assert.match(helper.stderr, /helper\.py/);
  assert.match(helper.stderr, /helper failure/);
});
