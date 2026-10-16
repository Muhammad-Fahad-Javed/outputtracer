# OutputTracer

Browser IDE for **running C++** and **tracing what it prints** — aimed at students who have to predict program output.

Live: [outputtracer.com](https://outputtracer.com)

## What you can do

- Write multi-file C++ (`main.cpp`, headers) in a Visual Studio–style editor
- **Run** in an interactive terminal (stdin over WebSocket)
- **Predict + Trace** to compile, capture stdout, and step through execution with GDB
- Practice 200+ output-tracing questions under `/practice`

## Run locally

You need Node 20+, `g++`, and (optional) `gdb`, `prlimit`, and `bubblewrap`.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test
npm run build
```

## Security and isolation

User source is written to a per-request temp directory and never reaches a
shell command line: the compiler, the compiled binary, and the GDB tracer are
all invoked via argv arrays (`execFile`/`spawn`), so source content cannot
inject shell commands. Everything untrusted now runs through **one** isolation
planner (`src/lib/sandbox.ts`), in order of preference:

1. **bubblewrap** — no network, private PID/UTS namespaces, read-only `/usr`
   (+ `/lib64` if present), `/dev`, `/proc`, a private `/tmp`, and only the
   submission dir writable. This is the only mode that also **restricts which
   host files are readable**.
2. **`unshare --net`** + `prlimit` — removes outbound network and bounds
   resources, but the host filesystem stays visible.
3. **`prlimit` alone** — bounds CPU, address space and process count. No
   filesystem or network isolation.
4. **none** — no isolation (non-Linux hosts, or missing tooling). It is
   reported internally as `none` and is **never used for graded execution**.

All three untrusted steps use the same planner and a sanitised, allow-listed
environment (`PATH`, `HOME`, `TMPDIR`, `LANG`, …) — the Node process's own
environment, including `SUPABASE_SERVICE_ROLE_KEY` and any other secret loaded
from `.env.local`, is **not** visible to them:

- **compile** (`g++`) — sandboxed, so a translation unit cannot `#include`
  host files into its own output or the binary;
- **run** (`predict` API and the interactive `/ws/terminal` session);
- **trace** (GDB re-runs the program) — sandboxed identically. If the only
  available mode would be `none`, tracing is **skipped** rather than
  re-executing untrusted code unsandboxed.
- **assemble** (the 8086 lab's native `nasm`) — sandboxed identically. With no
  sandbox available the pure-JS builtin assembler is used instead of running
  `nasm` unsandboxed.

**Fail closed.** If no isolation mechanism is available (`bubblewrap`,
`unshare --net` or `prlimit`), the pipeline **refuses to compile/run/trace**
rather than executing untrusted code directly on the host. This is enforced in
code (not just by a config default): `ALLOW_UNSANDBOXED_EXECUTION` /
`TRACE_ALLOW_UNSANDBOXED` can only loosen this **outside production**, and are
ignored entirely when `NODE_ENV=production`.

Honest limitations:

- The sandbox still shares the host kernel. **For a public internet
  deployment the real fix is one container or microVM per run** (e.g. gVisor,
  Firecracker, or a locked-down container with `--pids-limit`, no network, a
  read-only rootfs and a dedicated low-privilege uid). `prlimit`/`unshare`
  alone are best-effort, not a security boundary, and `prlimit --nproc` is
  shared per real user id, not per request.
- **The trace is a second execution.** Programs that read the clock, draw
  random numbers or print addresses can legitimately differ from the displayed
  run output; such traces are labelled in the UI (see
  `src/lib/traceDeterminism.ts`). The run output is authoritative.

Other hardening:

- **WebSocket Origin allow-list** — `/ws/terminal` and `/ws/collab` reject
  cross-site handshakes (CSWSH). Defaults to `outputtracer.com`; extend via
  `WS_ALLOWED_ORIGINS`; localhost is allowed only in development.
- **Bounded input** — per-message and per-session stdin caps for the terminal,
  and a maximum WebSocket frame size.
- **Rate limiting** with periodic eviction of stale keys. Set `TRUST_PROXY=1`
  behind a reverse proxy so rate limits use `X-Forwarded-For`.
- The public `GET /api` health check deliberately does **not** report the
  active isolation level.

Run the sandbox tests in Linux/WSL/CI. They self-skip when the tools are
missing; set `REQUIRE_SANDBOX_TOOLS=1` to make a missing tool fail the run.

| Env var | Default | Meaning |
| --- | --- | --- |
| `CXX_COMPILER` | `g++` | Compiler binary |
| `GDB_PATH` | `gdb` | GDB binary for tracing |
| `MAX_CONCURRENT_RUNS` | `4` | In-flight compile/run sessions |
| `MAX_MEMORY_MB` / `MAX_CPU_SECONDS` / `MAX_PROCESSES` | `256` / `5` / `32` | Programme resource limits |
| `COMPILE_MAX_MEMORY_MB` | `1024` | Compiler resource limit |
| `TRACE_MAX_MEMORY_MB` | `1024` | GDB tracer resource limit |
| `MAX_STDIN_BYTES` | `65536` | Total stdin forwarded to a program |
| `MAX_WS_STDIN_MESSAGE_BYTES` | `8192` | Max single terminal stdin message |
| `WS_MAX_PAYLOAD_BYTES` | `1048576` | Max WebSocket frame size |
| `WS_ALLOWED_ORIGINS` | _(empty)_ | Extra allowed WS origins (comma-separated) |
| `RATE_LIMIT_PREDICT_MAX` | `20` | `/api/predict` hits per IP per window |
| `ENABLE_TRACE` | on | Set `0` to skip GDB tracing |
| `ALLOW_UNSANDBOXED_EXECUTION` | off | Dev only: allow compile/run with **no** sandbox (never in production) |
| `TRACE_ALLOW_UNSANDBOXED` | off | Dev only: allow tracing with no sandbox (never in production) |
| `REQUIRE_SANDBOX_TOOLS` | off | Test/CI: fail (don't skip) if sandbox tools are missing |

## Docker

```bash
docker build -t outputtracer .
docker run --rm -p 3000:3000 --security-opt seccomp=unconfined outputtracer
```

`seccomp=unconfined` is only needed if you want bubblewrap user namespaces inside the container. Without it the app still runs with `prlimit` / `unshare` when the kernel allows them.

Health check: `GET /api`.
