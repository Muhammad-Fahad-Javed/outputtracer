# Test results

Host: Linux, Node v22.23.3, `g++` present, `gdb` / `nasm` / `bubblewrap` absent. No Supabase credentials. No production deploy.

## Commands

```text
npm ci
npx tsc --noEmit
npx eslint (changed files, max warnings 0)
npm test
npm run build
```

## `npm test` (`vitest run` 3.2.7)

```text
Test Files  31 passed (31)
Tests       303 passed, 2 skipped (305)
Duration    about 6 seconds
```

Skipped: the two bubblewrap-only cases in `src/lib/sandbox.integration.test.ts` (`tools.bwrap` is false). They were skipped, not passed.

Compiler cases that ran: hello world, infinite-loop timeout, stdout limit, `trace: false` does not call GDB, sandbox plan keeps `main.cpp` on the command line, environment is not visible to the child under `unshare-net`.

New or extended tests:

- `src/lib/sandbox.test.ts` compiler arguments survive `prlimit`
- `src/lib/cppRunner.traceFlag.test.ts`
- `src/lib/classroom/executionClient.test.ts` file map, `trace: false`, HTTP 503 and 429
- `src/lib/classroom/classroomRouteAuth.test.ts` 12 handlers
- `src/lib/classroom/classroom.test.ts` group membership and assignment binding
- `src/lib/classroom/phase3.test.ts` sandbox outage does not write a grade
- `src/lib/python/python.test.ts` no host fallback in production or when a configured worker fails
- `src/lib/learn/learn.test.ts` masked questions have an empty explanation
- `src/app/robots.test.ts`

## `npm run build`

Next.js 16.3.1 Turbopack. Compiled successfully. TypeScript finished. 276 static pages. Exit code 0. About 20 seconds. The build lists `ƒ Proxy (Middleware)` for `src/proxy.ts`.

## Not run

- Playwright or a browser session
- `npm audit` as a gate
- Migration apply
- `scripts/deploy-production.sh` (it targets `/home/ec2-user/outputtracer`)
- Authenticated end-to-end journeys A–D from the audit request
- Production predict after the fix (the live site does not have this commit)

GDB produced 0 steps because `gdb` is not installed. That is a skip of tracing, not a successful trace.
