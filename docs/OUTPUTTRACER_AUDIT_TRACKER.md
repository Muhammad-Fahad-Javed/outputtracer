# OutputTracer audit tracker

Authoritative status list for this repository. Older notes in `docs/audit/` describe earlier passes and are not restated here when they disagree with this file.

## Baseline

| Item | Evidence |
| --- | --- |
| Repository | `/workspace`, package name `outputtracer`, Next.js 16.3.1 |
| Branch | `cursor/full-audit-fixes-a40c` |
| Commit at the start of this pass | `6adaa251baa3409b83b63470d460367f16e4683a` |
| Working tree at the start of this pass | Clean and even with `origin/cursor/full-audit-fixes-a40c` |
| Secrets | No `.env` or `.env.local` in the workspace. Values were not printed. |
| Local server | `npm run dev` on port 3000. `POST /api/predict` of a hello-world returned `status: success` and output `hi\n` on 21 Oct 2026. |
| Production | `https://outputtracer.com/` returned 200. `https://www.outputtracer.com/` returned 308 to the apex. `http://outputtracer.com/` returned 301 to HTTPS. |
| Production compiler | `POST https://outputtracer.com/api/predict` of the same hello-world returned HTTP 200 with `g++: fatal error: no input files`. Checked 21 Oct 2026, 16:48 UTC. This branch is not deployed. |
| Database | No Supabase credentials in this environment. Applied migration history was not queried. |
| Sandbox on this VM | `npm test` logged `isolation: "bwrap"` for compiler runs. The EC2 host was not inspected. |
| Not done by this pass | No production deploy, no migration apply, no DNS or TLS change, no service restart on EC2. |

## Status counts

| Status | Count |
| --- | ---: |
| DONE_VERIFIED | 22 |
| PARTIALLY_DONE | 4 |
| NOT_DONE | 10 |
| BROKEN | 1 |
| BLOCKED | 5 |
| UNVERIFIED | 5 |
| NOT_APPLICABLE | 1 |
| Total | 48 |

## Master checklist

| ID | Category | Task | Status | Evidence | Next Action | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| OT-001 | Compiler | C++ hello-world on this branch | DONE_VERIFIED | Local `POST /api/predict` returned `hi\n`. `src/lib/cppRunner.test.ts` passed in `npm test` (331 passed, 1 skipped). | Skip | Critical |
| OT-002 | Compiler | C++ hello-world on production | BROKEN | Live `POST /api/predict` still returns `g++: fatal error: no input files`. | Deploy this branch with `scripts/deploy-production.sh` after authorization | Critical |
| OT-003 | Deployment | Ship the repair branch | BLOCKED | Not authorized to deploy or restart EC2. Rollback script exists and was not executed. | Operator runs the production script and confirms `hi` on the live API | Critical |
| OT-004 | Security | Process-group timeout | DONE_VERIFIED | `src/lib/processGroup.test.ts` passed, including the wall-clock kill. | Skip | High |
| OT-005 | Security | Bubblewrap on this VM | DONE_VERIFIED | Integration tests logged `isolation: "bwrap"`. The outside-include case compiled as an error. One isolation case remains skipped when no isolator exists; it did not run because bwrap is present. | Skip for this VM | Critical |
| OT-006 | Security | Bubblewrap on the EC2 host | UNVERIFIED | This VM is not the production host. No SSH inspection was performed. | On the host, run a hello-world and a program that tries to read `/etc/passwd` | Critical |
| OT-007 | Database | Apply migration 0013 | BLOCKED | File exists. No database credentials. Not applied. | Backup, then apply on staging before production | Critical |
| OT-008 | Database | Apply migration 0014 | BLOCKED | File exists. Not applied. Until it is, a signed-in browser can still write `practice_submissions.is_correct` through PostgREST. | Apply with 0013 after a backup | High |
| OT-009 | Security | RLS left enabled in migrations | DONE_VERIFIED | `src/lib/migrations.audit.test.ts` passed. The grant text was not changed in this pass. | Skip | High |
| OT-010 | Practice | Server-side practice grading | DONE_VERIFIED | `src/lib/practice.grade.test.ts` passed. Answers are not the verification target of a new client prop in this pass. | Skip | High |
| OT-011 | Learn | Lesson completion requires correct answers | DONE_VERIFIED | `src/lib/learn/learn.test.ts` (18) passed. Implementation was already on the branch and was not rewritten. | Skip | High |
| OT-012 | Assembly | Session caps and builtin assembler | DONE_VERIFIED | `src/lib/asm/asm.test.ts` (20) passed. | Skip | High |
| OT-013 | Assembly | Native NASM | NOT_DONE | `nasm` is not installed on this VM. The lab uses the builtin assembler. Production was not checked. | Install and test NASM only on a host where the lab should use it | Medium |
| OT-014 | Python | Isolated Python execution | BLOCKED | No `PYTHON_SANDBOX_URL` worker in this environment. Host fallback stays off when production rules apply. `src/lib/python/python.test.ts` (36) passed. | Provide an isolated worker before enabling execution | High |
| OT-015 | Java | Java compiler | NOT_APPLICABLE | No Java route or runner exists. Do not advertise one. | None | Low |
| OT-016 | Debugger | Hide GDB argc/argv and runtime symbols | DONE_VERIFIED | `readableTraceVariables` is applied to each returned step. Three unit tests passed, including `x = 1` kept beside `argc`, `argv`, and `std::__cxx11`. A new GDB capture was not recorded. | Skip | Medium |
| OT-017 | Classroom | Student `mine` includes a group submission | DONE_VERIFIED | `pickOwnSubmission` and `listCallerGroupIds` tests passed, including a memory group membership. `GET .../mine` calls both. Supabase was not connected, so the SQL was not executed. | Re-check with a real group submission after 0013 | High |
| OT-018 | Classroom | Teacher announcement composer | DONE_VERIFIED | Local `POST /api/classroom/{id}/announcements` returned 200. The class page showed "Post an announcement" and the pinned post "Lab moved". Stored in memory only. | Skip | High |
| OT-019 | Classroom | Assignment submit control | DONE_VERIFIED | `AssignmentWorkspace.tsx` renders "Submit assignment". Route argument-order tests passed (`classroomRouteAuth.test.ts`, 12). The button was not clicked in a browser this pass. | Click submit with a real student session after deploy | High |
| OT-020 | Classroom | Assignment test editor | PARTIALLY_DONE | The create form sends one public case and one hidden case. There is no list editor for many cases. | Add a repeatable case list only if teachers need more than one of each | Medium |
| OT-021 | Classroom | Local teacher dashboard without Supabase | DONE_VERIFIED | Development with no credentials returns `canCreateClassroom: true`. Production mode returns 401 (`localTeacherPreview.test.ts`). Roster label is "Local teacher". | Skip. Do not treat this as a production login. | Medium |
| OT-022 | Auth | Real student, teacher, admin, and OAuth sessions | BLOCKED | No Supabase URL, anon key, or service role in this environment. | Configure a staging project and sign in with each role | Critical |
| OT-023 | Security | Content-Security-Policy enforcement | PARTIALLY_DONE | Responses use `Content-Security-Policy-Report-Only` and still allow inline and eval script for Monaco and Next. Enforcing it was not attempted. | Browser-pass the IDE, then enforce | Medium |
| OT-024 | Security | HSTS | NOT_DONE | HTTPS on the apex works through Cloudflare. `ENABLE_HSTS` was not turned on. | Set the flag only after the certificate policy is confirmed | Medium |
| OT-025 | Collaboration | Removed member keeps an open socket | NOT_DONE | New joins are checked. An already-open socket is not closed on removal. Not changed. | Disconnect the room member when access is revoked | Medium |
| OT-026 | Classroom | Discussion composer, rubric editor, gradebook button | NOT_DONE | APIs exist. No page in `src/` posts to the discussion, rubric, or gradebook export routes. Not built in this pass. | Add UI only for the workflow that teachers actually need next | Medium |
| OT-027 | Admin | Moderation action on the admin dashboard | NOT_DONE | `POST /api/admin/moderation` exists. The dashboard does not call it. Not changed. | Wire the existing route to the archived-state control | Medium |
| OT-028 | Learn | Python curriculum file is unused | NOT_DONE | `curriculum/python-curriculum.json` is not imported by the learn seed. Not changed. | Import it only when the Python course should be published | Low |
| OT-029 | IDE | Dead Close tab control | DONE_VERIFIED | The empty `onClick` button was removed from `UnifiedShell.tsx`. The editor still has one buffer per language. | Skip | Low |
| OT-030 | Accessibility | Account menu state | DONE_VERIFIED | The account button now sets `aria-expanded` and `aria-haspopup`. Not checked with a screen reader. | Skip | Low |
| OT-031 | Accessibility | Manage-class field labels | DONE_VERIFIED | Group, assignment, due date, points, and student pickers use `htmlFor` and matching ids. Checkbox rows were already wrapping their inputs. | Skip | Low |
| OT-032 | Navigation | Three separate nav bars | NOT_DONE | `Header`, `UnifiedShell`, and `WorkspaceHeader` still each render navigation. Merging them would be a redesign. | Leave unless a single nav is an explicit product change | Low |
| OT-033 | IDE | Save button alerts instead of persisting | NOT_DONE | `UnifiedShell` save handler still calls `alert`. Not changed. Cloud save remains the projects flow. | Replace the alert with the real local download or remove the control | Low |
| OT-034 | SEO | Canonical host, www, and HTTP | DONE_VERIFIED | Live www returned 308 to `https://outputtracer.com/`. Live HTTP returned 301 to HTTPS. `canonicalHost.test.ts` passed. | Skip | Medium |
| OT-035 | SEO | robots.txt private prefixes | DONE_VERIFIED | `src/app/robots.test.ts` passed. | Skip | Medium |
| OT-036 | SEO | Sitemap course URLs and Core Web Vitals | UNVERIFIED | No Lighthouse run. Sitemap course coverage was not re-measured this pass. | Measure after the compiler deploy | Low |
| OT-037 | Routing | Public pages and protected redirects | PARTIALLY_DONE | Production homepage is 200. Earlier anonymous checks redirected `/projects`, `/admin`, and `/learn/dashboard`. Those redirects were not repeated on every route in this pass. | Re-probe the protected list after deploy | Medium |
| OT-038 | Projects | Create, save, download, and share | UNVERIFIED | No signed-in Supabase user. Local project store tests passed (`localProjectStore.test.ts`, 3). | Exercise `/projects` with a real session | High |
| OT-039 | Realtime | WebSocket origin, room cap, and production upgrade | PARTIALLY_DONE | `wsOrigin.test.ts` passed. A production WebSocket upgrade was not attempted. | After deploy, open two editors in one room | High |
| OT-040 | Tests | Automated suite | DONE_VERIFIED | `npm test` exit 0. 37 files, 331 passed, 1 skipped. The skip is the "no isolator" case, which does not apply while bwrap exists. | Skip | High |
| OT-041 | Tests | Browser end-to-end suite | NOT_DONE | No Playwright project. This pass used Chrome only for the teacher class page. | Add Playwright later; do not block the compiler deploy on it | Medium |
| OT-042 | Build | Typecheck and lint of this pass | DONE_VERIFIED | `npx tsc --noEmit` exit 0. eslint on the edited paths exit 0. A fresh `next build` was not repeated. | Run `next build` in the deploy script | High |
| OT-043 | Deployment | Rollback drill | NOT_DONE | `rollback_promoted` is documented and was not executed. | Run it on staging before relying on it | High |
| OT-044 | Operations | Logs, backups, and monitoring | UNVERIFIED | No access to EC2 logs, PM2, Nginx, or backup storage. | Operator confirms the last backup and that the app process is healthy | High |
| OT-045 | Security | Rate-limit client IP | DONE_VERIFIED | `src/lib/rateLimit.test.ts` (7) passed. | Skip | High |
| OT-046 | Dev | Preview and 127.0.0.1 script allowlist | DONE_VERIFIED | `next.config.ts` allows `127.0.0.1` and `**.agent.cvm.dev`. The teacher page loaded its client bundle from `http://127.0.0.1:3000`. | Skip | Medium |
| OT-048 | Admin | Server-side admin checks | DONE_VERIFIED | Admin routes still resolve the Supabase user and `checkIsAdmin`. No admin session was available, so the pages were not clicked. The check itself is covered by role tests (`roles_and_profiles.test.ts`, `auth.test.ts`). | Click `/admin` with an admin user after credentials exist | High |
| OT-049 | Profiles | Account deletion and retention | UNVERIFIED | `DELETE /api/profile` exists. It was not called. Classroom row retention after delete was not traced against a database. | Read-only review on staging, then a disposable account delete | Medium |

## Change log

| Task | Files | Root cause | Fix | Tests | Result | Deployed |
| --- | --- | --- | --- | --- | --- | --- |
| OT-016 | `src/lib/gdbTracer.ts`, `src/lib/gdbTracer.test.ts` | GDB `info args` always prints `argc` and `argv`, and a later frame appends standard-library symbols to the same string. | Filter returned step variables. Assignments split on a following name so values that contain commas stay intact. | `npx vitest run src/lib/gdbTracer.test.ts` | 7 passed | No |
| OT-017 | `src/lib/classroom/ownSubmission.ts`, `classroomService.ts`, `mine/route.ts`, `ownSubmission.test.ts` | `GET .../mine` queried only `student_id`, so a group row was invisible to its members. | Load the caller's groups in that class and select the latest matching group submission. | `ownSubmission.test.ts` | 4 passed | No |
| OT-018 | `src/app/classroom/[classId]/page.tsx` | The announcements API existed and the empty state told teachers to post, with no form. | Teacher form posts title, message, and pin, then shows the saved announcement. | Local POST 200 and Chrome text check for "Lab moved" | Passed locally, memory store | No |
| OT-021 | `localTeacherPreview.ts`, `classroomService.ts` | The sample teacher appeared as `User local-pr`. | Set the memory member label to "Local teacher". | Roster JSON after the running server reloaded | `('Local teacher', 'teacher')` | No |
| OT-029 | `src/components/UnifiedShell.tsx` | Close tab used an empty click handler. | Removed the control. The editor has a single buffer per language, so there was no close behavior to restore. | Source inspection and eslint | Passed | No |
| OT-030 | `src/components/Header.tsx` | The account button did not expose whether the menu was open. | `aria-expanded` and `aria-haspopup` | eslint | Passed | No |
| OT-031 | `src/app/classroom/[classId]/manage/page.tsx` | Several inputs had visible labels that were not associated. | `htmlFor` and ids | eslint | Passed | No |
| Tracker | this file, `docs/audit/remaining-issues.md` | Status was split across older audit notes, some of which still said the submit button and announcement form were missing. | This tracker is the current list. | `npm test`, `tsc --noEmit` | 331 passed, 1 skipped; tsc exit 0 | No |

## Rollback

These edits are application code and docs. Revert the commit to restore the previous classroom page, mine query, and trace text. No migration, environment variable, or production process was changed.
