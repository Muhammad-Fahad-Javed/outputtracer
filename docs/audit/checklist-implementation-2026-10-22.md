# Checklist implementation baseline — 22 October 2026

Baseline branch: `cursor/split-typecheck-deploy-daed`. Commit: `8fdee515246e9da8bac38fe4e6b0871918245c82`. Working tree was clean. No stashes existed, so there was no stash content to compare. The five paths named in section A had no uncommitted changes. Existing implementations are committed baseline work, not patches to discard.

Recoverable source archives: `/tmp/outputtracer-checklist-baseline/source.tar` and `/tmp/outputtracer-checklist-working-source.tar.gz`. These are local temporary checkpoints; the Git history is the durable reference. Release `7731c0a` was deployed on 23 October 2026 with Supabase connected; migration 0016 was applied successfully.

## Initial verification

- Vitest: 41 files passed; 351 tests passed, 2 skipped.
- TypeScript: failed because the installed dependency tree lacked `@marsidev/react-turnstile`; associated callback types also failed.
- ESLint: three pre-existing React effect errors in TeacherWatch/useClassroomCollab and one unused callback parameter warning.
- No production build was completed before edits. Candidate verification is recorded separately.

## Implementation completed locally

- Student dashboard counts only completed practice rows, queries unread counts independently of the recent ten, includes group submissions, and reports database failures rather than false zeros.
- Progress reports use latest submitted/graded work per assignment; group members receive completion credit; genuine zero grades participate in averages. Grade queries are restricted to classroom submissions. Current group membership is used; historical membership remains a separate requirement.
- Management console uses one cancellable loading path including invitations and progress on initial load.
- Teacher self-service activation UI and caller-scoped SQL RPC. Migration 0016 preserves legacy approved storage values and suspended/revoked restrictions. It does not auto-promote denied applications, grant administrator access, or delete historical applications. SQL execution succeeded; an authenticated disposable-user flow is still pending.
- Teacher login directs inactive profiles to activation; learners retain their role choice. Existing administrator moderation services remain available.
- Classroom joining-code randomness now uses Node crypto rather than Math.random. Rotation/expiry lifecycle is not claimed complete.
- History diff checks both versions, assignment scope, and group ownership. Snapshots, grade operations, and feedback operations check assignment/submission ownership.
- Existing lint failures fixed using derived selection and an external-store subscription for Yjs contribution state.

## Confirmed limitations and remaining work

- The full PDF is not complete. Sections B, E–Q require further feature work and acceptance verification.
- Similarity jobs/reports and assembly manual-entry policy are not implemented by this pass. Classroom execution currently hardcodes C++; adding assembly policy requires a deliberate language integration.
- Open collaboration sockets still need access-revocation verification, message-rate tests, and real simultaneous-browser tests.
- Existing authorship coloring is not proof of authorship. Durable event attribution, paste classification, history comparison UX, and review metrics require further validation.
- Live schema/applied migrations, real stored metrics, OAuth, Turnstile enforcement, account sessions, email delivery, Nginx/PM2/Cloudflare and production isolation remain unverified.
- npm installation reported 15 dependency advisories (2 moderate, 9 high, 4 critical). No forced dependency upgrades were made; advisory analysis remains pending.
- EC2 access is working as `ec2-user`. The live checkout is `/home/ec2-user/outputtracer`, managed by PM2 as `outputtracer`, and its local `/api` health check returns HTTP 200. The candidate remains isolated from that checkout.

## Route and method inventory (source inspection only)

- Page `/about` — `src/app/about/page.tsx`
- Page `/admin/learn` — `src/app/admin/learn/page.tsx`
- Page `/admin` — `src/app/admin/page.tsx`
- Page `/admin/teachers` — `src/app/admin/teachers/page.tsx`
- Page `/assembly` — `src/app/assembly/page.tsx`
- Page `/classroom/[classId]/assignments/[assignmentId]` — `src/app/classroom/[classId]/assignments/[assignmentId]/page.tsx`
- Page `/classroom/[classId]/manage` — `src/app/classroom/[classId]/manage/page.tsx`
- Page `/classroom/[classId]/messages` — `src/app/classroom/[classId]/messages/page.tsx`
- Page `/classroom/[classId]` — `src/app/classroom/[classId]/page.tsx`
- Page `/classroom/invite/[token]` — `src/app/classroom/invite/[token]/page.tsx`
- Page `/classroom` — `src/app/classroom/page.tsx`
- Page `/classroom/student` — `src/app/classroom/student/page.tsx`
- Page `/classroom/teach/apply` — `src/app/classroom/teach/apply/page.tsx`
- Page `/classroom/teacher` — `src/app/classroom/teacher/page.tsx`
- Page `/examples` — `src/app/examples/page.tsx`
- Page `/groups/[id]` — `src/app/groups/[id]/page.tsx`
- Page `/groups` — `src/app/groups/page.tsx`
- Page `/learn/courses/[courseSlug]/[lessonSlug]` — `src/app/learn/courses/[courseSlug]/[lessonSlug]/page.tsx`
- Page `/learn/courses/[courseSlug]` — `src/app/learn/courses/[courseSlug]/page.tsx`
- Page `/learn/dashboard` — `src/app/learn/dashboard/page.tsx`
- Page `/learn` — `src/app/learn/page.tsx`
- Page `/login/admin` — `src/app/login/admin/page.tsx`
- Page `/login/learner` — `src/app/login/learner/page.tsx`
- Page `/login` — `src/app/login/page.tsx`
- Page `/login/teacher` — `src/app/login/teacher/page.tsx`
- Page `/p/[id]` — `src/app/p/[id]/page.tsx`
- Page `/` — `src/app/page.tsx`
- Page `/practice/[topic]/[id]` — `src/app/practice/[topic]/[id]/page.tsx`
- Page `/practice/[topic]` — `src/app/practice/[topic]/page.tsx`
- Page `/practice` — `src/app/practice/page.tsx`
- Page `/profile` — `src/app/profile/page.tsx`
- Page `/projects` — `src/app/projects/page.tsx`
- Page `/python` — `src/app/python/page.tsx`
- Page `/signup` — `src/app/signup/page.tsx`

## API and other route handlers

- `/api/admin/audit` — GET
- `/api/admin/invitations` — GET, POST, DELETE
- `/api/admin/invite/[token]` — POST
- `/api/admin/learn` — GET, POST
- `/api/admin/moderation` — POST
- `/api/admin/overview` — GET
- `/api/admin/teachers` — GET, POST
- `/api/admin/users` — GET, PATCH
- `/api/asm` — POST
- `/api/classroom/[classId]/announcements` — GET, POST
- `/api/classroom/[classId]/assignments/[assignmentId]/execute` — POST
- `/api/classroom/[classId]/assignments/[assignmentId]/mine` — GET
- `/api/classroom/[classId]/assignments/[assignmentId]` — GET, PATCH
- `/api/classroom/[classId]/assignments/[assignmentId]/rubric` — GET, POST
- `/api/classroom/[classId]/assignments/[assignmentId]/session` — POST
- `/api/classroom/[classId]/assignments/[assignmentId]/submissions/[submissionId]/feedback` — GET, POST
- `/api/classroom/[classId]/assignments/[assignmentId]/submissions/[submissionId]/grade` — GET, POST
- `/api/classroom/[classId]/assignments/[assignmentId]/submissions/[submissionId]/snapshot` — GET
- `/api/classroom/[classId]/assignments/[assignmentId]/submit` — POST
- `/api/classroom/[classId]/assignments/[assignmentId]/versions` — GET, POST
- `/api/classroom/[classId]/assignments/[assignmentId]/watch` — GET
- `/api/classroom/[classId]/assignments` — GET, POST
- `/api/classroom/[classId]/discussions` — GET, POST
- `/api/classroom/[classId]/gradebook/export` — GET
- `/api/classroom/[classId]/groups` — GET, POST, PUT, DELETE
- `/api/classroom/[classId]/invitations/[invitationId]` — DELETE
- `/api/classroom/[classId]/invitations` — GET, POST
- `/api/classroom/[classId]/messages/conversations` — GET
- `/api/classroom/[classId]/messages/read` — PATCH
- `/api/classroom/[classId]/messages` — GET, POST
- `/api/classroom/[classId]/reports/progress` — GET
- `/api/classroom/[classId]/reports` — GET, POST, PATCH
- `/api/classroom/[classId]/roster` — GET, DELETE
- `/api/classroom/[classId]` — GET
- `/api/classroom/invite/[token]` — GET, POST
- `/api/classroom/join` — POST
- `/api/classroom/notifications` — GET, PATCH
- `/api/classroom` — GET, POST
- `/api/classroom/student/dashboard` — GET
- `/api/classroom/teacher/apply` — GET, POST
- `/api/config` — GET
- `/api/learn/progress` — POST
- `/api/practice/grade` — POST
- `/api/predict` — POST
- `/api/profile/avatar` — POST, DELETE
- `/api/profile` — GET, PUT, DELETE
- `/api/projects/[id]/sync` — POST
- `/api/python` — POST
- `/api/python/trace` — POST
- `/api` — GET
- `/api/session-role` — GET
- `/auth/callback` — GET
- `/auth/continue` — GET

## Migration inventory (repository only)

- `0001_cloud_ide.sql` — applied state unknown
- `0002_practice_and_snippets.sql` — applied state unknown
- `0003_learn_platform.sql` — applied state unknown
- `0004_learn_protect_answers.sql` — applied state unknown
- `0005_classroom_platform.sql` — applied state unknown
- `0006_phase3_versioning_grading.sql` — applied state unknown
- `0007_phase4_communications.sql` — applied state unknown
- `0008_classroom_integrity_fixes.sql` — applied state unknown
- `0009_messaging_invitations.sql` — applied state unknown
- `0010_admin_invitations_and_roles.sql` — applied state unknown
- `0011_user_profiles_and_roles_system.sql` — applied state unknown
- `0012_python_language_support.sql` — applied state unknown
- `0013_close_privilege_gaps.sql` — applied state unknown
- `0014_practice_answer_integrity.sql` — applied state unknown
- `0015_classroom_collab.sql` — applied state unknown
- `0016_teacher_self_service.sql` — applied successfully on 23 October 2026

## Verification after this implementation batch

- Full Vitest suite: 46 files passed; 371 tests passed, 2 skipped. The skips are retained, not converted to passes. The same suite passed in the isolated EC2 candidate, including C++, GDB and outbound-network isolation integration checks.
- New regression coverage: completed practice count, full unread count, current group completion, zero-score averages, empty datasets, dashboard storage failures, teacher activation failure, both sides of version diffs, cross-assignment snapshot access, foreign-group snapshots, cross-assignment grade/feedback reads and writes.
- Student recent grades now read `submission_grades`, the canonical store written by gradingService, rather than legacy grade columns that are not kept in sync.
- TypeScript and ESLint were rerun after restoring the missing installed dependency. See final check status below.
- Local disk pressure prevented a trustworthy local production build, so source was copied to `/home/ec2-user/outputtracer-candidate.FqZtvz` on EC2. The live checkout and its `.next` directory were not modified.
- The isolated EC2 candidate passed `npm ci`, ESLint, a memory-capped standalone TypeScript check, and a full Turbopack production build. The final build was repeated after the last dashboard regression fix and completed successfully from the exact candidate source.
- Release `7731c0a` is live on EC2 with Supabase configured. The public release verifier passed all route classes, C++ and assembly smoke tests passed, and the isolated Python run/trace worker remains enabled after all 11 adversarial checks passed.
- Migration 0016 was applied successfully. The anon key can read `learn_courses`, the service role can read `profiles`, and auth-gated pages redirect anonymous users to login.
- npm reported 15 dependency advisories (2 moderate, 9 high, 4 critical). No forced dependency changes were made as part of this functional batch.
- The production host initially lacked Bubblewrap, so production policy could not provide private-filesystem isolation. Amazon Linux package `bubblewrap` 0.10.0 was installed. The first probe found `/usr/bin/ld` resolves through `/etc/alternatives`, which was absent inside the sandbox; the sandbox now mounts that symlink directory read-only without exposing all of `/etc`.
- Production-mode EC2 integration now verifies that ordinary C++ compilation, execution and GDB tracing work under Bubblewrap, child processes do not inherit server secrets, source compilation cannot read an outside marker file, and outbound network access is blocked.
- Public verification of the pre-deployment release found a corrupt/incomplete `.next`: most routes returned 500 with missing client-reference manifests, newer routes returned 404, and no `BUILD_ID` or release marker existed. The homepage, robots and sitemap were the only checked 200 responses. PM2 remained online, but the release was not healthy.

Final static checks for this batch: local and isolated-EC2 TypeScript checks exit 0; local and isolated-EC2 ESLint exit 0 with no warnings; `git diff --check` exit 0. These results do not verify live SQL or authenticated browser behavior.
