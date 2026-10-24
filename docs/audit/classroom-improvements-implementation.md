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
resizable/collapsible editor panels; private interactive NASM sessions using the
existing 8086 engine, with waiting/resume and deterministic grading kept separate.

Migrations: 0020–0024. Existing assignments retain legacy classroom groups and
paste behavior; existing identifiers, documents, submissions, snapshots and grades
are not replaced. A submitted team's membership freeze survives reopening work.

## Verification completed

- Vitest: **417 passed, 2 skipped, 57 files passed**.
- TypeScript: `npx tsc --noEmit` passed separately.
- ESLint: `npx eslint src server.ts` passed without warnings.
- Production build: Next 16.3.1/Turbopack passed, 280 static pages generated.
  Build used `NEXT_DEPLOYMENT_ID=classroom-20261024` and skipped the in-build
  duplicate typecheck after the separate successful check.
- `npm run test:migrations`: isolated PostgreSQL/WASM executes new migrations
  unchanged. Checks cover legacy data/defaults, rejected/atomic team writes,
  independent assignments, permanent freeze, direct membership mutation denial,
  teacher revocation, message idempotency, recipient RLS/read state, push outbox
  deduplication/retry exhaustion and single active comparison job.
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

Production remains on release **1afda3f**. The permission-changing migrations are
awaiting fresh browser-action confirmation. Deployment, authenticated production
regressions, actual Realtime delivery and browser-push opt-in/device/account-switch
checks remain pending. No end-to-end production completion claim is made here.

Typing restrictions are browser UI controls, not independent-authorship proof.
Similarity scores support review and never change grades or claim AI detection.
NASM runs are temporary actor-bound private sessions; shared editing remains durable.
Similarity jobs currently fail explicitly above 2,000 snapshots or 10 minutes rather
than silently truncating the comparison corpus. Browser push requires valid VAPID
configuration, permission and browser support. Background jobs are disabled for
candidate smoke servers so they cannot deliver production notifications.
