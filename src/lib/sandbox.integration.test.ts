// Integration tests for the execution sandbox. They actually compile and run
// untrusted code, so they only do anything on a Linux host with g++ (and, for
// the filesystem/network assertions, bubblewrap / unshare).
//
// Reporting contract:
//   - missing tool, REQUIRE_SANDBOX_TOOLS unset -> SKIPPED (never "passed")
//   - missing tool, REQUIRE_SANDBOX_TOOLS=1     -> RUNS and FAILS
//
// On a Windows dev box these are all skipped — run them in Linux/WSL/CI.

import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { compileAndRun } from "./cppRunner";
import { selectIsolation } from "./sandbox";
import { probeSandboxTools, REQUIRE_SANDBOX_TOOLS, skipUnless } from "./testTools";

const tools = await probeSandboxTools();
const isolation = await selectIsolation();
const canExerciseSandbox = tools.bwrap || tools.unshare;

describe("execution isolation (integration)", () => {
  it.skipIf(skipUnless(tools.compiler && isolation !== "none"))(
    "does not expose the server environment to the program",
    async () => {
      process.env.OUTPUTTRACER_TEST_SECRET = "SECRET_MARKER_7f3a";
      try {
        const result = await compileAndRun({
          source: `#include <iostream>
#include <cstdlib>
int main() {
  const char* s = std::getenv("OUTPUTTRACER_TEST_SECRET");
  std::cout << (s ? s : "absent");
}`,
        });
        expect(result.status).toBe("success");
        expect(result.stdout).not.toContain("SECRET_MARKER_7f3a");
        expect(result.stdout).toContain("absent");
      } finally {
        delete process.env.OUTPUTTRACER_TEST_SECRET;
      }
    },
    30_000
  );

  it.skipIf(skipUnless(tools.bwrap))(
    "the compiler cannot read files outside the submission directory (bwrap only)",
    async () => {
      // Under REQUIRE_SANDBOX_TOOLS this asserts bubblewrap is actually in use.
      expect(isolation).toBe("bwrap");

      const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "ot-outside-"));
      const secretPath = path.join(outsideDir, "secret.h");
      await fs.writeFile(secretPath, "#define OUTSIDE_SECRET 424242\n", "utf8");
      const posixSecretPath = secretPath.split(path.sep).join("/");
      try {
        const result = await compileAndRun({
          files: {
            "main.cpp": `#include "${posixSecretPath}"
#include <iostream>
int main() { std::cout << OUTSIDE_SECRET; }`,
          },
        });
        // The include must not succeed and leak the outside value.
        const printed = result.status === "success" ? result.stdout ?? "" : "";
        expect(printed).not.toContain("424242");
      } finally {
        await fs.rm(outsideDir, { recursive: true, force: true });
      }
    },
    30_000
  );

  it.skipIf(skipUnless(canExerciseSandbox))(
    "runs without outbound network access",
    async () => {
      expect(["bwrap", "unshare-net"]).toContain(isolation);
      const result = await compileAndRun({
        source: `#include <cstdio>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
int main() {
  int s = socket(AF_INET, SOCK_STREAM, 0);
  if (s < 0) { std::printf("0"); return 0; }
  sockaddr_in a{};
  a.sin_family = AF_INET;
  a.sin_port = htons(53);
  inet_pton(AF_INET, "1.1.1.1", &a.sin_addr);
  int rc = connect(s, reinterpret_cast<sockaddr*>(&a), sizeof(a));
  std::printf("%d", rc == 0 ? 1 : 0);
  return 0;
}`,
      });
      // A successful outbound connection would print "1". With no network
      // namespace the connect fails (or times out) — either way not "1".
      expect(result.stdout ?? "").not.toBe("1");
    },
    30_000
  );

  if (REQUIRE_SANDBOX_TOOLS) {
    it("has the sandbox tooling CI requires", () => {
      expect(tools.compiler).toBe(true);
      expect(isolation).not.toBe("none");
    });
  }
});

// Always meaningful where it can run: with NO isolation available (and no
// explicit non-production opt-in) the pipeline must refuse rather than run.
describe("fail-closed execution policy (integration)", () => {
  it.skipIf(isolation !== "none")(
    "refuses to execute when no isolation is available",
    async () => {
      const result = await compileAndRun({ source: "int main() { return 0; }" });
      expect(result.status).toBe("server_error");
      expect(result.title).toBe("Execution unavailable");
    },
    30_000
  );
});
