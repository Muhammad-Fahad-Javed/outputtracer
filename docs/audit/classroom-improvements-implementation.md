# Classroom/editor implementation — 24 October 2026

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

Migrations implemented: 0020–0026 (0026 awaiting production approval). Existing assignments retain legacy classroom groups and
paste behavior; existing identifiers, documents, submissions, snapshots and grades
are not replaced. A submitted team's membership freeze survives reopening work.

## Verification completed

- Vitest: **421 passed, 2 skipped, 58 files passed**.
- TypeScript: `npx tsc --noEmit` passed separately.
- ESLint: `npx eslint src server.ts` passed without warnings.
- Production builds: Next 16.3.1/Turbopack passed locally and on the bounded
  EC2 candidate for **f3582b3**, generating 280 static pages. The final candidate
  used 650 MiB memory, 1.4 GB swap and one CPU core with release id
  `classroom-20261024-v3`; the in-build duplicate typecheck was skipped after
  the separate successful check. Its SHA-256 verified archive is prepared on EC2.
- Authenticated candidate API checks: **32 passed** initially; **31 passed** on
  the final build (the one-time pending-teacher approval check was already satisfied).
  These cover role forgery/RPC denial, atomic concurrent team creation, assignment
  boundaries, paste policy/logging, isolated interactive NASM, teacher run restrictions,
  immutable resubmission history, frozen teams, durable idempotent messages, recipient
  read state, saved-work resumption/revocation fallback and opt-in push configuration.
  Disposable sessions were issued through the authorized administration API;
  password login CAPTCHA protection remains enabled.
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

Production application remains on release **1afda3f**. The user approved and
Supabase successfully applied migrations **0020–0024**. A subsequent private
verification found all 16 original classes, 15 groups, 14 assignments, 3 documents,
7 submissions and 13 immutable snapshots intact. Teacher profiles now comprise
one approved instructor with provenance and four profiles pending administrator
review. No real teacher was automatically reapproved.

Supabase also successfully applied **0025**, a submission-validation correction.
It rejects groups attached to individual assignments and preserves the ability
to grade previously submitted frozen-team work after a student leaves the
classroom roster. It changes the validation function without replacing existing
rows or changing grants and policies.

The source branch is pushed through **f3582b3**, including complete team rosters
and refreshing existing service-worker registrations without opting users into push.
Large outbound artifact transfers stalled/truncated; SHA verification rejected the
incomplete upload. The temporary unpublished GitHub draft was deleted. A final
build/archive and matching runtime dependencies are prepared separately on EC2.

Additional live database tests identified historical recursive classroom/roster
policies (42P17). Hidden-test privileges are already denied, but recursion masks
that expected permission error. **0026** replaces the cycle with actor-scoped
helpers, requires approval in reversed historical teacher-owner comparisons and
reasserts hidden-column denial. The isolated PostgreSQL tests pass direct student
class/roster/assignment reads, hidden-column rejection, and suspended-teacher
read/update denial. It is staged in Supabase, awaiting confirmation before execution.
Production promotion, worker completion, actual Realtime delivery and browser-push
permission/device/account-switch checks remain pending; no production completion
claim is made here.

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
