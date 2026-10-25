# Compiler and console examples — 25 October 2026

The examples are reproducible with `scripts/test-compiler-examples.mjs`. They run sequentially, use small programs, create only temporary execution sessions, and never edit coursework. Python HTTP requests authenticate an existing disposable student from the server's private QA fixture. No account passwords, session tokens, or service keys are written to the report.

## Released behavior and acceptance results

Production release `console-20261025-v5`, source commit `3cbf34541286e4f11d9df91fdcc05ce2dabe72c9`, is deployed at `https://outputtracer.com`. GitHub main and the implementation branch contain the changes. The final promotion verified all 15 public routes returned HTTP 200.

- A Console tab is now the default for C++, Python and 8086 Assembly in the standalone and student assignment workspaces. The teacher watch view also has a private console for the selected student's or team's canonical code.
- C++ and Python stream actual stdout/stderr and accept live stdin, empty lines and whitespace. Run, Stop, EOF, Clear, Copy and Download work without removing the existing Output, Input, tests or debugging panels. Python retains its sign-in requirement.
- NASM uses actual output and input requests from the existing 8086 engine, including echoed character, non-echo character and buffered line input. Console controls preserve the existing register, memory, stack and instruction panels.
- Console sessions remain mounted when switching tabs. Assignment execution ignores supplied client source, rechecks permissions, and uses private input even when the source document is shared. Human input waits use a 120-second wall budget; CPU and output limits still apply.
- Initial assignment-session network/JSON failures now retry with the same bounded backoff used after a dropped collaboration socket. Permission-denied responses remain blocked. This followed a transient failure seen in the live browser; refresh and origin/public session checks confirmed the endpoint and document were healthy.

Verification completed:

- **34/34 compiler and execution checks passed** on the candidate and deployed console runtime: four valid examples per language, deliberate language errors, C++/Python interactive prompts, EOF and Stop, and NASM interactive input modes. The old C++ EOF/Stop failures described below passed on the replacement handler.
- **27/27 expanded classroom checks passed** on production: student and teacher session creation and collaboration join roles in both languages, canonical source, whitespace, waiting for human input, foreign-document denial, forged authentication, language mismatch, teacher revocation and Python guest denial. An earlier extended run timed out at the final Python revocation scenario; a repeat with minimal event diagnostics passed the complete sequence. The final browser checks were run separately to avoid sharing the QA account's single execution slot with the automated checks.
- **438 tests passed, 2 skipped**, across 60 application test files; **25 Python worker tests passed**. TypeScript and ESLint passed. The production build completed successfully in a constrained candidate checkout before atomic promotion.
- Visible browser checks completed for standalone C++, Python and NASM, plus a student's Python assignment console. The assignment output preserved leading/trailing input spaces and exited with code 0. Switching away from a waiting C++ console and back preserved the run.

The compiler suite report is `/tmp/outputtracer-console-production-examples.json` on EC2; expanded classroom results are `/tmp/outputtracer-classroom-console-production-extended.json`. They contain pass labels and disposable fixture IDs, without credentials. Local proof screenshots include `/tmp/outputtracer-console-cpp-live.jpg`, `/tmp/outputtracer-console-python-live.jpg`, `/tmp/outputtracer-console-nasm-live.jpg` and `/tmp/outputtracer-assignment-console-live.jpg`.

No database migration was required for this release. Existing coursework, grades and snapshots were preserved. These are functional checks, not a load test or evidence of 300-student capacity.

## Initial production checks

Target: the running production app on EC2, `http://127.0.0.1:3000`, with the browser's authorized `https://outputtracer.com` Origin. The localhost target avoids Cloudflare during execution checks; public-browser checks are recorded separately by the deployment owner.

Four valid examples passed for each language, and one deliberate invalid program per language produced its expected language diagnostic:

- C++: hello; sum 1–5 and factorial 5; multiline input containing leading/trailing spaces and an empty line; two prompts followed by a function call.
- Python: the same four scenarios, including `input()` and a function call.
- NASM/8086: DOS hello; addition and counted output loops; DOS buffered line input preserving leading/trailing spaces; echo character input followed by non-echo character input.

Representative exact outputs (newlines escaped):

- C++ hello: `Hello, C++!\n`.
- Python hello: `Hello, Python!\n`.
- C++ and Python arithmetic: `sum=15, factorial=120\n`.
- C++ and Python multiline: `[  Ada Lovelace  ]\n[]\n[second line]\n`.
- C++ and Python prompts: `Name: Number: Grace Hopper: 42\n`.
- NASM hello: `Hello, NASM!\r\n`.
- NASM arithmetic: `5!!!`.
- NASM line input: `Line:   Ada Lovelace  \n`.
- NASM character/non-echo: `Character: A Private: `; the private `x` is absent from output.

The first NASM line-input assertion omitted the DOS Enter echo in its expected string. The actual output preserved all spaces and echoed the newline. Correcting the test expectation and rerunning all NASM examples produced 5/5 passing checks. This did not require an application change.

C++ WebSocket console checks also passed all four valid examples and the deliberate compilation error. The prompt test sends each answer only after observing that prompt in streamed output, verifying real waiting and resume behavior.

The old deployed C++ WebSocket handler did not complete EOF or Stop within the check's 35-second deadline. Those two checks terminated their own sockets, rather than leaving execution sessions behind. They must pass against the replacement handler before rollout is accepted.

NASM's interactive HTTP path passed another 5/5 checks, rerunning all four examples plus the invalid instruction without preloading input. The line-input example reported a genuine `line` pause; the two-character program reported `character` followed by `character_no_echo`. Both resumed successfully and exited with code 0, preserving spaces and suppressing the private character in output.

## Running the checks

From a configured server checkout with dependencies and its private environment file:

```sh
node --env-file=.env.production.local scripts/test-compiler-examples.mjs \
  --base=http://127.0.0.1:3000 --mode=buffered --report=/tmp/compiler-buffered.json
node --env-file=.env.production.local scripts/test-compiler-examples.mjs \
  --base=http://127.0.0.1:3000 --mode=ws --languages=cpp,python --report=/tmp/compiler-terminal.json
node --env-file=.env.production.local scripts/test-compiler-examples.mjs \
  --base=http://127.0.0.1:3000 --mode=interactive --languages=nasm --report=/tmp/compiler-nasm-interactive.json
```

The script supports `--mode=all`. Set `QA_ACCOUNT_PATH` when the existing QA fixture is stored elsewhere. `QA_PROJECT_ROOT` selects the checkout from which dependencies are loaded. `--origin`/`QA_ORIGIN` selects an already-authorized browser Origin; production's cross-site protection is not disabled.

WebSocket checks include EOF and stopping a waiting program. These use the console protocol, rather than simulating buffered execution: init `{ language, files }`, input `{ type: 'stdin', data }`, end input `{ type: 'eof' }`, and `{ type: 'stop' }`. NASM uses its existing private-token HTTP session protocol and checks actual `waiting_for_input` modes before each resume.

These are functional examples, not a concurrency or capacity measurement. They do not establish how many students the current server can support.
