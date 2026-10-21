# Compiler and tracer

## What actually runs

C++ is a real `g++` process. `compileAndRun` in `src/lib/cppRunner.ts` writes the submission to a temp directory and invokes the compiler through `planSandboxedCommand` (`execFile` / `spawn` with an argument array, not a shell). The interactive terminal uses the same planner (`src/lib/wsTerminal.ts`). GDB tracing is a second execution (`src/lib/gdbTracer.ts`) and is skipped when the caller passes `trace: false`.

Python is a Docker worker (`sandbox-worker/server.mjs`) when `PYTHON_EXECUTION_ENABLED=true` and the URL and token are set. The live site returns 503 `disabled`. 8086 does not execute machine code on the host. See [assembly-lab.md](./assembly-lab.md).

## OT-001 — `prlimit` dropped the compiler arguments (fixed in this branch)

`prlimitPrefix` returned `prlimit --nproc=… --as=… --cpu=… -- g++` and never appended `main.cpp`, `-std=`, or `-o`. Any host with `prlimit` (the usual production case, and this audit host) compiled nothing.

Live evidence, `POST https://outputtracer.com/api/predict` on 21 October 2026:

```json
{"status":"error","stderr":"g++: fatal error: no input files\ncompilation terminated.\n"}
```

`GET /api` on the same host reported `g++ (GCC) 11.5.0` and `status: ok`. The compiler binary exists. It was invoked without a file.

After the fix, on this host (`isolation: unshare-net`):

- hello-world stdout `ok`
- `for(;;) {}` status `timeout` after about 5 seconds
- a tight `cout` loop status `output_limit`
- `trace: false` does not call `traceExecution`

`src/lib/sandbox.test.ts` asserts the planned command line still contains `main.cpp` and `main.out`.

## Isolation

| Mode | Filesystem | Network | Used when |
| --- | --- | --- | --- |
| bubblewrap | Submission dir plus read-only `/usr` | none | `bwrap` works |
| `unshare --net` + `prlimit` | Host filesystem visible | no new outbound net | unshare works, no bwrap |
| `prlimit` only | Host filesystem visible | host network | prlimit only |
| none | Host | Host | Refused in production |

This host has no bubblewrap, so tests ran under `unshare-net`. That is not a claim that the live host uses the same mode. `GET /api` deliberately does not report the isolation level.

`ALLOW_UNSANDBOXED_EXECUTION` cannot enable unsandboxed C++ in production (`unsandboxedExecutionAllowed`).

## Grading path

`runInSandbox` posts `{ files, stdin, trace: false }` to loopback `/api/predict` when `SANDBOX_EXECUTION_URL` is unset. It used to concatenate every file into one string, so a second `.cpp` or a header was a comment. HTTP 429 and 503 are now `ExecutionError`s. `autoGradeSubmission` rethrows `sandbox_unavailable` and `timeout` instead of storing them as a failed test. A program that exits non-zero still counts as a miss.

The external sandbox URL is still unauthenticated. `.env.example` says it must be reachable only from this host.

## Limits that remain

- Compile and GDB still use `execFile` timeout, which signals the direct child. The run path kills the process group. Grandchildren of `g++` or `gdb` can outlive a compile timeout when the mode is `prlimit` or `unshare` rather than bubblewrap.
- The writable temp directory has no `RLIMIT_FSIZE`.
- Public predict and the terminal (when no `projectId` is sent) do not require a logged-in user. That matches the public IDE.
- Rate limits use the first `X-Forwarded-For` hop when `TRUST_PROXY` is on. HTTP handlers pass `undefined` as the socket address, so with the flag off every caller shares the key `unknown`.
- GDB records locals after `step`, so a call site can show the callee's frame. This host could not run GDB (`gdb` is not installed; trace steps were 0).
- No hostile payloads were executed against production.

## Local programs exercised after the fix

| Case | Result |
| --- | --- |
| Hello world | success, stdout `ok` |
| Infinite loop | timeout |
| Excessive stdout | output_limit |
| Empty files / `../escape.cpp` | `invalid_request` without spawning the compiler |
| `cin`, classes, STL, multi-file | Not each run as a separate case in this audit. The runner accepts a file map; multi-file grading now sends that map. |
| Concurrent load, refresh during a run | Not measured |
