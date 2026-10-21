# Prioritized fix plan

Complexity is the size of the change, not a calendar estimate.

## Fixed in this branch

| ID | Severity | Change | Test |
| --- | --- | --- | --- |
| OT-001 | P0 | `prlimitPrefix` appends the real argv | `sandbox.test.ts`, `cppRunner.test.ts` |
| OT-002 | P1 | `getClassroom(user.id, classId)` on the assignment routes | `classroomRouteAuth.test.ts` |
| OT-020 | P1 | Assignment must belong to the class. `groupId` must be a membership | `classroom.test.ts` |
| OT-003 | P1 | Python host fallback only outside production, only when the worker is unconfigured, only with `ALLOW_UNSANDBOXED_EXECUTION`. Local child env is sanitized | `python.test.ts` |
| OT-004 | P1 | Grading posts `files` and `trace: false` | `executionClient.test.ts`, `cppRunner.traceFlag.test.ts` |
| OT-005 | P1 | 429/503 and sandbox outages are not stored as a wrong answer | `executionClient.test.ts`, `phase3.test.ts` |
| OT-006c (partial) | P1 | Student learn questions no longer include `explanation` in the payload | `learn.test.ts` |
| OT-007 | P2 | Examples, lessons, and practice load into `UnifiedShell` | Manual code path. No browser test |
| OT-008 | P2 | `robots.ts` prefixes and `noindex` layouts | `robots.test.ts` |
| OT-009 | P2 | Deploy script restores `.next.prev` after a failed promotion | `bash -n` only |
| OT-021 | P3 | `src/app/not-found.tsx` | Build emits `/_not-found` |

## Must be applied by an operator

| ID | Severity | Action |
| --- | --- | --- |
| OT-001 live | P0 | Deploy this branch. Then `POST /api/predict` a hello world and expect `hi` |
| OT-006 | P1 | Apply `supabase/migrations/0013_close_privilege_gaps.sql` after review. Do not disable RLS |

## Still open

| ID | Priority | Why it was not changed here |
| --- | --- | --- |
| Assignment submit UI, announcement composer, test editor | P1 product | New UI, not a one-line defect. The APIs can be called once OT-002 is deployed |
| OT-011 rate-limit spoofing | P2 | Needs the real Nginx `X-Forwarded-For` append behavior. Guessing the hop would break limits |
| OT-012 GDB frame and compile process-group kill | P2 | No `gdb` here. The compile kill change can strand a run if done wrong |
| OT-013 asm session caps | P2 | Needs a limit design and a load test |
| OT-014 CSP | P2 | Easy to break Monaco, Turnstile, and Supabase without a browser pass |
| OT-015 practice answers in the client | P2 | The bank is static and graded in the browser on purpose. Moving it server-side is a product change |
| Collab document size | P2 | Rejecting Yjs updates needs a protocol decision |
| `nasm` crash falls back to the builtin assembler | P3 | Behavior change for labs that prefer a hard error |
| Admin invite reports success when the service client is missing | P3 | False success, no privilege grant |
| Logged-out classroom empty state | P3 | Copy change. The API already returns 401 |
| `deploy.sh` still targets `outputtracer.devs.surf` | P3 | Leaving the old script in place avoids surprising a host that still uses it. Prefer `scripts/deploy-production.sh` |
| Disk quota on the compile temp dir | P2 | Needs `RLIMIT_FSIZE` tested so normal programs still write the binary |
| Duplicate nav, close-tab no-op, label `htmlFor` | P3 | Polish. Close-tab has no behavior to restore |

## Groups

1. Production outage: deploy OT-001.
2. Authorization data: apply 0013. The route argument fix deploys with the app.
3. Broken routes: classroom APIs after deploy. Confirm with a teacher token.
4. Workflows: assignment editor and submit button are the next product change.
5. Compiler: process-group kill and GDB `next` after a host with `gdb` and `bubblewrap` is available.
6. Database: 0013, then a policy test with the anon key.
7. Reliability: rate-limit hop, asm caps, temp disk cap.
8. Accessibility: labels, account menu, close tab.
9. SEO: confirm live robots after deploy. Do not add pages.
10. Later: Python course import, collab caps, CSP.
