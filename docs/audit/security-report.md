# Security report

Review method: source and SQL reading, anonymous production requests, and unit tests. No exploit was run against another user's data. No service-role key was present in this environment. No committed live secret was found (searches for key material hit tests, `.env.example`, and documentation names only).

| ID | Severity | Status | Component | What was verified |
| --- | --- | --- | --- | --- |
| OT-001 | Critical (availability) | Fixed and deployed | `src/lib/sandbox.ts` `prlimitPrefix` | Live predict returned `CPP_OK` under Bubblewrap on release `7731c0a`. |
| OT-006a | High | Migration written, not applied | `profiles` select | Policy text lets every signed-in user read every profile. Not executed against production. |
| OT-006b | High | Migration written, not applied | `profiles.email` update | Policy allows it. Next profile API does not write email. Direct PostgREST was not attempted. |
| OT-006c | High | Branch blanks the student payload; column revoke is in 0013 | Learn explanations | `normalizeQuestion` now returns `explanation: ""` when masking. Seed text still contains the answer on the server. |
| OT-006d | High | Migration only | `hidden_test_cases` | API strips the field (`classroomService.ts`). RLS cannot. |
| OT-006e | High | Migration only | submission insert | Students can set `grade` if the grant exists. App inserts via the service role. |
| OT-003 | High | Fixed and deployed | `pythonSandboxClient.ts` | Production has no host fallback. The authenticated loopback worker runs each request in a fresh locked-down Docker container; all 11 adversarial checks passed. |
| OT-002 | High (broken authz, fail closed) | Fixed in branch | Classroom assignment routes | Swapped ids made `getClassroom` look up a classroom id equal to the user id. 12 route tests expect `(user-1, class-1)`. |
| OT-004 | High for grading correctness | Fixed in branch | `executionClient.ts` | Multi-file bodies were concatenated. The internal POST now sends `files`. |
| OT-005 | High for grade integrity | Fixed in branch | `gradingService.ts` | Sandbox outage is rethrown. A wrong program still fails the test. |
| OT-020 | Medium | Fixed on execute and submit | `groupId` | Client `groupId` is checked with `callerCanUseGroup`. |
| OT-011 | Medium | Open | `rateLimit.ts` | First `X-Forwarded-For` hop is trusted when `TRUST_PROXY` is set. Not exploited. |
| OT-012 | Medium | Open | `gdbTracer.ts`, compile `execFile` | Suspected wrong frame after `step`. Process-group kill is missing for compile and GDB. Not reproduced (no gdb). |
| OT-013 | Medium | Open | `src/app/api/asm/route.ts` | In-memory sessions, 1 MB RAM image, synchronous `run`. No production load test. |
| OT-014 | Low | Open | Live headers | Response had `server: cloudflare` and `x-powered-by: Next.js` on the homepage. No `content-security-policy`, `x-frame-options`, or `strict-transport-security` header was visible from `curl -sI` (HSTS may be set only on some responses; it was not in the homepage header dump). |
| OT-015 | Medium, by design of the static bank | Open | `data/questions/*.json` | Practice `answer` is passed into a client component and graded locally. |
| OT-009 | Medium (deploy safety) | Fixed in branch | `deploy-production.sh` | Health-check failure after promotion called `fail` and left the new build live. It now swaps `.next.prev` back. |
| OT-008 | Low | Fixed in branch, live until deploy | `robots.ts` | `/projects/` does not match `/projects`. Private layouts now send `noindex`. |

## Controls that were confirmed in source

- C++ argv arrays, sanitized child env, production refusal of isolation `none`.
- WebSocket Origin check. Missing Origin is allowed for non-browser clients (`wsOrigin.ts`).
- OAuth `next` is a same-origin path.
- Admin HTTP handlers call `checkIsAdmin` before using the service role.
- Predict with `projectId` loads files from the hub, not from the caller's body.

## Not claimed

The site is not "secure" because these items were reviewed. RLS was not executed. Authenticated cross-user access was not attempted with real accounts. Dependency `npm audit` was not treated as a vulnerability list. No package was upgraded to silence an advisory.
