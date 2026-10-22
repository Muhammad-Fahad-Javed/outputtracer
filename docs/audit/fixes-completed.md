# Fixes completed

Branch: `cursor/full-audit-fixes-a40c`. PR #2 is open and still a draft. It is not merged. Nothing in this change was deployed, and no migration was applied to a database.

Host for the checks below: Linux, Node 22, `g++` 13.3, bubblewrap 0.9.0, gdb 15.1. `nasm` is not installed. Supabase credentials are not configured. The production site was not changed.

## Already on this branch before this pass

| ID | What | Evidence |
| --- | --- | --- |
| OT-001 | `prlimitPrefix` forwards `g++` arguments | `sandbox.test.ts`. Local `POST /api/predict` of hello world returns `output: "hi"`, `exitCode: 0`. |
| OT-002 | `getClassroom(user.id, classId)` on assignment routes | `classroomRouteAuth.test.ts` |
| OT-020 | Assignment belongs to the class; `groupId` must be a membership | `classroom.test.ts` |
| OT-003 | Python does not run on the host in production or when a configured worker fails | `python.test.ts` |
| OT-004 / OT-005 | Grading sends the file map and does not store a sandbox outage as a wrong answer | `executionClient.test.ts`, `phase3.test.ts` |
| OT-009 | `scripts/deploy-production.sh` restores `.next.prev` after a failed promotion | Script review. Not executed on a host. |

## This pass

| ID | Root cause | Files | What changed | Tests |
| --- | --- | --- | --- | --- |
| OT-010 | `execFile` timeout killed only the direct child | `src/lib/processGroup.ts`, `cppRunner.ts`, `gdbTracer.ts`, `wsTerminal.ts`, `nasmRunner.ts` | Compile, GDB, and nasm run in a new process group. Timeout sends SIGTERM, then SIGKILL, and waits for the leader to exit. Temp directories are removed before the result returns. | `processGroup.test.ts` forks Python and checks `ps`. Compiler timeout test still returns `timeout`. |
| OT-016 | Bubblewrap was treated as missing because the probe executed `true` with an empty PATH | `src/lib/sandbox.ts` | The probe uses `/usr/bin/true` and the same `/usr`, `/lib`, `/lib64` mounts as a real run. | After the fix, compiler logs say `isolation: "bwrap"`. |
| OT-017 | `unshare --net` leaves the host filesystem visible, and production still allowed it | `src/lib/sandbox.ts`, `cppRunner.ts`, `wsTerminal.ts` | Production accepts only bubblewrap unless `ALLOW_FILESYSTEM_VISIBLE_SANDBOX=1`. Development and tests may still use `unshare` or `prlimit`. | `sandbox.test.ts`. Live local predict of a program that reads `/etc/passwd` printed `closed`, not the file. Integration test: an absolute `#include` of a file outside the submission did not print `424242`. Network integration test passed under bwrap. |
| OT-018 | Student programs and the compiler could create unbounded files | `execConfig.ts`, `sandbox.ts` | `prlimit --fsize` is 8 MB for a program and 64 MB for `g++`. | Hello world, multi-file, and stdin/stderr tests still pass, and the planned command contains `--fsize=`. |
| OT-011 | Rate limits trusted the left-most `X-Forwarded-For` hop | `src/lib/rateLimit.ts` | With `TRUST_PROXY`, the client is the address `TRUSTED_PROXY_HOPS` from the right (default 1). A spoofed left-most hop is ignored. Direct requests keep the socket address. | `rateLimit.test.ts` |
| OT-013 | Assembly sessions were an unbounded map keyed only by an id | `src/lib/asm/session.ts`, `src/app/api/asm/route.ts`, `AssemblyLab.tsx`, `UnifiedShell.tsx` | Each session has an unguessable token. Later calls must send it. At most 200 sessions, 4 per caller, 15 minute idle expiry, step cap 5000. | `asm.test.ts` |
| OT-019 | A nasm crash fell through to the built-in assembler | `nasmRunner.ts` | If native nasm was selected and then crashes or returns diagnostics, the response stays `native-nasm` and does not silently reassemble. Native nasm still requires an acceptable sandbox; otherwise the built-in assembler is used. This host has no nasm, so the lab still uses `builtin-nasm-compat`. | Existing assembler tests. |
| Assignment create | The form omitted starter code and tests, so the server stored Hello World and an empty test list | `classroomService.ts`, `manage/page.tsx` | The form sends starter code, an optional second file, one public test, one hidden test, and the late-submission flag. The server validates filenames and test size. The default starter is a blank `main`, not a program that prints Hello World. | `classroom.test.ts` |
| Assignment submit | The assignment page had no editor or submit action | `AssignmentWorkspace.tsx`, assignment page, `mine/route.ts`, submit and execute routes | A signed-in student can edit the starter files, run public tests, submit the file map, resubmit, and see their own grade and feedback. Hidden tests are not in that response. | UI is covered by the existing auth tests plus manual review of the route. No browser session was available. |
| OT-015 | Practice `answer` and `explanation` were props of a client component | `practice.ts`, question page, `QuestionClient.tsx`, `api/practice/grade/route.ts` | The page passes a public question. Grading is `POST /api/practice/grade`. The explanation is returned only after a correct answer. The app no longer writes `is_correct` from the browser. | `practice.grade.test.ts` |
| Lesson completion | `mark_complete` stored a completion with no check | `learn/db.ts`, progress route, `LessonActions.tsx` | A lesson with published questions is complete only after a correct attempt for each question. The button shows the server error. | `learn.test.ts` |
| OT-014 | No CSP or frame/referrer headers, and `X-Powered-By: Next.js` was sent | `securityHeaders.ts`, `next.config.ts` | Enforced: `nosniff`, referrer policy, `DENY` frames, permissions policy, `poweredByHeader: false`. CSP is **report-only**. HSTS is sent only when `ENABLE_HSTS=1`. | `securityHeaders.test.ts`. `curl -sI http://127.0.0.1:3000/` showed the report-only policy and no `X-Powered-By`. |
| Collab | Yjs updates could introduce a filename the create-file path would reject | `collabHub.ts`, `server.ts` | An update is applied only if every filename stays valid and the file map stays inside the source limits. A room accepts at most 24 sockets. WebSocket sockets are pinged and terminated when they stop answering. Join still requires a project access token. | Typecheck. No multi-user socket test. |
| `deploy.sh` | The script targeted `outputtracer.devs.surf` | `deploy.sh` | The script prints that it is retired and exits 1 before it installs packages, writes Nginx, or starts Docker. | `bash -n` not required; the file is a short exit. |

## Migrations

Reviewed, not applied:

- `supabase/migrations/0013_close_privilege_gaps.sql` drops the broad profile read, stops profile email updates, removes answer and explanation columns from learner selects, stops learners inserting completions, attempts, grades, and audit rows. It does not `DISABLE ROW LEVEL SECURITY` and does not delete rows.
- `supabase/migrations/0014_practice_answer_integrity.sql` drops learner insert/update on `practice_progress` and learner insert on `practice_submissions`, so a browser session cannot mark itself correct. `/api/practice/grade` writes those rows with the service role.

`src/lib/migrations.audit.test.ts` asserts those statements are present. It does not connect to Postgres.
