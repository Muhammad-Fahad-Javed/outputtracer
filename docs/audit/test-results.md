# Test results

Initial audit host: Linux, Node v22, `g++` 13.3, bubblewrap 0.9.0, gdb 15.1. Production follow-up on 23 October 2026 deployed release `7b31d54` to EC2 with Bubblewrap 0.10.0 and the isolated Python worker. Supabase migration 0016 still awaits final confirmation.

Bubblewrap and gdb were installed on this VM so the sandbox and tracer could be exercised. That install is local to the VM. It is not a change to the production host.

## Commands

```text
npx tsc --noEmit          # exit 0
npx eslint <changed paths> # exit 0
npm test                  # vitest run
NEXT_DIST_DIR=.next-verify npx next build   # exit 0, route table printed
```

## `npm test`

```text
Test Files  35 passed (35)
Tests       321 passed, 1 skipped (322)
Duration    about 7 seconds
```

The skipped test is the fail-closed case that only runs when the host has no isolation at all. This host has bubblewrap, so that case is skipped rather than passed.

Compiler and sandbox cases that ran under `isolation: "bwrap"`:

- Hello world stdout
- Compile error is not a timeout
- stdin `41` and separate stderr `e`
- `main.cpp` plus `helper.cpp` prints `5`
- Two concurrent programs do not mix stdout
- Infinite loop returns `timeout`
- Stdout spam returns `output_limit`
- Child environment does not include server secrets
- Compiler cannot include a file outside the submission directory
- Outbound network is blocked
- Process-group kill reaps a forked Python sleeper

## Local server

Dev server restarted on `http://127.0.0.1:3000`.

- Homepage headers include the report-only CSP and do not include `X-Powered-By`.
- `POST /api/predict` hello world: `{"status":"success","output":"hi","meta":{"exitCode":0}}`.
- A program that reads `/etc/passwd` printed `closed`.

## Not run

Playwright, a signed-in classroom journey, Postgres policy tests with user JWTs, `scripts/deploy-production.sh`, and rollback on a spare host.
