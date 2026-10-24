# Classroom/editor implementation — 25 October 2026

Branch: `codex/classroom-editor-improvements`.

Implemented the agreed admin-only teacher approval flow; pending review for legacy
self-activated teachers; protected owner access and recurring collaboration-session
revalidation; assignment-specific exact-size teams (2–20, default 2), transactional
membership changes and permanent freeze on first submission; typing-only defaults
and logged allowed paste; teacher-only queued similarity reports with starter and
boilerplate exclusion, evidence passages and prior-self-work labels; durable atomic
messages/recipient notifications, opt-in push subscriptions/outbox and safe static
service-worker caching; accessible-workspace history/resume and All Projects;
readable page/editor surfaces, contextual language labels, compact dashboards and
resizable/collapsible editor panels, complete assignment-team rosters including offline members; private interactive NASM sessions using the
existing 8086 engine, with waiting/resume and deterministic grading kept separate.

Production migrations applied: 0020–0026. Existing assignments retain legacy classroom groups and
paste behavior; existing identifiers, documents, submissions, snapshots and grades
are not replaced. A submitted team's membership freeze survives reopening work.

## Verification completed

- Vitest: **421 passed, 2 skipped, 58 files passed**.
- TypeScript: `npx tsc --noEmit` passed separately.
- ESLint: `npx eslint src server.ts` passed without warnings.
- Final production build: Next 16.3.1/Turbopack passed for **9bb856a**,
  generating 280 static pages. The isolated EC2 build used 650 MiB memory,
  1.4 GB swap and one CPU core; separate TypeScript and ESLint checks passed.
  Release: `classroom-20261024-v5`. Verified archive SHA-256:
  `33c7d21c6f0286dafec18e92f0840597f8c5049640179860104d0f0ecbdf1a11`.
- Authenticated production API checks: **31 passed**, plus **15 additional
  live access/Realtime checks**. Coverage includes role-cookie/RPC/metadata
  forgery denial, concurrent atomic teams, independent assignment membership,
  paste-policy/logging boundaries, isolated interactive NASM, run restrictions,
  immutable resubmissions, frozen teams, durable idempotent messages, recipient
  read state, workspace resumption/revocation fallback and opt-in push configuration.
  The extra checks verify direct hidden-column denial, five unrelated-teacher
  access boundaries, actual recipient-filtered Realtime delivery, duplicate retries,
  reconnect reconciliation and forged-filter isolation.
  The initial candidate also passed the one-time pending-teacher approval check.
  Disposable sessions were issued through the administration API; password-login
  CAPTCHA protection remains enabled.
- Active-session production revocation: **4 checks passed**. Both student and
  teacher collaboration connections initialized; temporary suspension immediately
  denied the disposable teacher's HTTP access and closed their socket with 1008
  during revalidation, while the student remained connected. Approval was restored.
- Production similarity worker completed at 100% across five latest snapshots,
  with one explicit insufficient-original-code entry for the starter-only fixture.
- All 15 public production routes returned HTTP 200 after promotion and the site
  served the expected release identifier. Candidate smoke checks also verify
  protected and configuration-gated routes.
- `npm run test:migrations`: isolated PostgreSQL/WASM executes new migrations
  unchanged. Checks cover legacy data/defaults, rejected/atomic team writes,
  independent assignments, permanent freeze, direct membership mutation denial,
  teacher revocation, message idempotency, recipient RLS/read state, push outbox
  deduplication/retry exhaustion, single active comparison job, rejection of
  foreign assignment groups for individual submissions, and grading frozen-team
  history after a student leaves the classroom roster.
  Bootstrap accommodations for historical migrations are documented in that script;
  these tests are not a live Supabase/Realtime or multi-connection load test.
- Local browser: readable assignment form entries, NASM language/main.asm starter,
  typing-only default and native clipboard blocking; private NASM character input
  followed by non-echo input, actual stdout `A`, exit code 0; narrow and 1440px
  workspace layouts, keyboard input/undo controls and collapsed teacher details.
- Local HTTP fixture creates one complete two-student assignment team.

## Backup and rollout state

A mode-600 compressed export of 22 tables / 270 rows is stored on EC2 at
`/home/ec2-user/.outputtracer-backups/classroom-before-0020-0024-20261024.json.gz`.
It includes profiles, roles, teacher applications/profiles, classes, teams,
assignments, documents, submissions, snapshots, grades, feedback and messages.
This is a paged data export; it is not a transactionally frozen/PITR database backup.
The reusable export command is `scripts/backup-classroom-data.mjs`.

Production serves **9bb856a** (`classroom-20261024-v5`), pushed to GitHub main
and the implementation branch. Previous build and dependency trees are retained
on EC2 for rollback. Approved migrations **0020–0024** were applied before release.
A private preservation check verified all 16 original classes, 15 groups, 14
assignments, 3 documents, 7 submissions and 13 immutable snapshots remained intact.
Unverified legacy teachers were moved to pending review; only the disposable QA
teacher was subsequently reapproved for tests. No real teacher was automatically
reapproved.

Supabase also successfully applied **0025**, a submission-validation correction.
It rejects groups attached to individual assignments and preserves the ability
to grade previously submitted frozen-team work after a student leaves the
classroom roster. It changes the validation function without replacing existing
rows or changing grants and policies.

Large outbound artifact transfers stalled/truncated; SHA verification rejected
the incomplete upload. The temporary unpublished GitHub draft was deleted.
The final build and archive were produced in an isolated EC2 checkout, then
verified and promoted with the deployment script. Existing service-worker
registrations refresh without opting users into push. A final mobile check found
and fixed the notification control being hidden with desktop navigation.

The user approved **0026**, and Supabase applied it successfully. It removes the
historical recursive classroom/roster policy cycle, enforces approval in reversed
teacher-owner comparisons and reasserts hidden-column denial. Production direct
hidden-test selection now returns the expected permission error (42501), replacing
the recursive-policy error (42P17). No coursework rows were deleted or rewritten.

Browser checks visibly confirmed readable typed NASM form text, main.asm starter,
typing-only/team defaults, compact classroom footer, full-height teacher watch,
complete frozen team roster and the completed similarity report. Local checks
also exercised the student editor's DOS character/non-echo input and paste block.
Actual device push delivery, denial, background notification links and logout/
account-switch behavior still require an opted-in compatible browser; they must
not be represented as verified by the API/outbox tests. Website notification
persistence and live Realtime behavior are verified independently.

Typing restrictions are browser UI controls, not independent-authorship proof.
Similarity scores support review and never change grades or claim AI detection.
NASM runs are temporary actor-bound private sessions; shared editing remains durable.
Similarity jobs currently fail explicitly above 2,000 snapshots or 10 minutes rather
than silently truncating the comparison corpus. Browser push requires valid VAPID
configuration, permission and browser support. Background jobs are disabled for
candidate smoke servers so they cannot deliver production notifications.

An additional active collaboration-session suspension regression passed in the
10-test collaboration file. The three service-worker privacy tests also passed
independently, as did the migration acceptance script through 0026.
