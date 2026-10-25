# Compiler and console examples — 25 October 2026

The examples are reproducible with `scripts/test-compiler-examples.mjs`. They run sequentially, use small programs, create only temporary execution sessions, and never edit coursework. Python HTTP requests authenticate an existing disposable student from the server's private QA fixture. No account passwords, session tokens, or service keys are written to the report.

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
