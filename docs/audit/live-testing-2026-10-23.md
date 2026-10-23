# Live walkthrough and capacity observations — 23 October 2026

Production: https://outputtracer.com. Verification uses the previously authorized
E2E student, teacher and administrator accounts and disposable classrooms. No real
student records were edited. This is broad regression testing, not a claim that
every possible interaction or production load has been certified.

## Completed checks

- Actual browser teacher and learner password login and role dashboards.
- Teacher Studio: 11 disposable classrooms; NASM management, roster, groups,
  assignment form language inheritance, starter filename and visible typed text.
- Student cannot enter the admin dashboard or admin login while signed in as a
  non-admin. Both display restriction panels.
- Public C++ execution with stdin and an 8-step trace; Python execution with stdin
  and a 5-step trace; NASM execution, final registers, memory and stack panels.
- NASM student group assignment: live editor, visible code edit, public tests,
  final registers and version saving. Teacher can run its code and the public
  sample passes. Starter code is excluded from authorship percentages.
- Previous authenticated API integration passed C++, Python and NASM group
  assignment creation, language inheritance, session entry files, execution,
  public tests, version saving, initial durable submission and teacher watch.
  Hidden tests were withheld from student responses.
- Practice: the Basic Syntax / Variable Scope question accepted `10 30`, marked
  it correct and returned its explanation. Learn catalog and NASM course detail
  pages loaded.
- Automated suite: 400 passed across 51 files, 2 existing isolation tests skipped.
  TypeScript and changed-file ESLint pass. Production build passes.
- Public release verification covers 15 routes, protected redirects and safe
  configuration-gated API denials. The deployment script repeats candidate and
  live checks before considering a release successful.

## Bugs found by the visible walkthrough

1. Authenticated pages built without local Supabase configuration were cached as
   anonymous denials, causing a teacher redirect loop. Fixed and deployed in
   b14a56f: always read request cookies before configuration checks and mark the
   guarded teacher page dynamic. Added a regression test. Login form contrast was
   also fixed.
2. Individual progress ignored group hand-ins even though class completion counted
   them. Fixed in f17a02f with a member/non-member regression test. Also replaced
   stale C++-only assignment help text.
3. Teacher editor remained on a CDN-loading screen for an extended period. The
   classroom editor now uses its installed Monaco runtime, shared with Yjs,
   rather than fetching a second runtime from the CDN (71a82e5).
4. A second hand-in failed with a unique constraint violation on
   submission_snapshots.submission_id. Existing code versions and the original
   immutable snapshot remain saved. Migration 0019 removes only that uniqueness
   constraint and adds a latest-snapshot lookup index. Code selects the newest
   snapshot; old rows and grade references remain intact. A regression test
   covers multiple snapshots. Migration 0019 was applied successfully through Supabase after explicit user
   approval. Release 1afda3f is deployed. C++, Python and NASM each passed two consecutive
   hand-ins; old snapshot IDs/hashes were preserved, latest-snapshot retrieval
   passed, group individual progress showed one hand-in and teacher watch worked.

Administrator browser login completed after Cloudflare verification. Overview,
user directory, educator/invitation tools, classroom/CMS controls and security
audit tabs were inspected without changing real users or privileges. The
authenticated admin overview API also returned 200 during the bounded checks.
This does not substitute for testing every administrator mutation. Google OAuth,
email delivery/reset, destructive account/classroom deletion, paid upgrades,
real-user messages and a simultaneous two-identity browser cursor demonstration
were not performed in this pass. Collaboration synchronization and policy locking
are covered by integration tests. Assignment step tracing, interactive runtime
stdin, activity-time tracking and assignment memory/stack panes remain outside the
implemented assignment feature set.

## Capacity evidence

EC2 is t3.micro (2 vCPU, 913 MiB usable RAM), region eu-north-1 / Stockholm.
Point-in-time sample: ~453 MiB Node RSS, ~173 MiB available RAM, ~192 MiB swap in
use, ~8 GB disk free of 20 GB. A later idle sample had 338 MiB available and
156 MiB swap used; these are snapshots, not peak measurements.

Supabase project is Free/Nano in ap-southeast-2 / Sydney. Dashboard showed healthy
status, ~0.03 GB database, 14/60 connections, roughly 2–4% CPU and a ~422 MB memory
sample. Some observability charts did not load. Database size is approximate UI
telemetry, not an exact pg_database_size query.

The C++ application gate permits 4 global runs and 1 per owner. Runtime memory cap
is 256 MB and compiler cap is 1024 MB. Multiplying those limits does not describe
safe concurrency on this 1 GB machine. Collaboration permits 24 connections per
document room, including teachers and extra tabs; that is not a platform student
limit. The deployed Python worker uses its defaults: 2 active containers, queue length
8 and 128 MiB/container (no PM2 overrides were present).

A bounded read-only test sent one batch each at concurrency 1, 3 and 5 for student,
teacher and admin dashboards from EC2 to localhost. All 27 responses were HTTP 200.
Student latency ranged 3304–4123 ms across the batches; teacher 1050–1852 ms; admin
1070–1873 ms. The localhost origin excludes the user's path to EC2 but still
includes cross-region Supabase calls. This is not sustained load, unique users,
compiler saturation, a p95 estimate or proof of maximum capacity.

A 10–20 mostly editing student pilot is a conservative planning estimate to
validate, not a guaranteed supported class size. Before normal class launch,
co-locate app and database, add app RAM (4 GB is a starting configuration), and
queue or separate compiler execution. Run a sustained staging workload before
publishing a supported student count. No paid resources were changed.

Supabase Free's 50,000 monthly active users, 500 MB database and Nano's 60 direct /
200 pooler connections are plan allowances, not concurrent student guarantees.
T3 CPU credit mode and balance were not inspected.

Official references checked for this report:
- https://supabase.com/pricing
- https://supabase.com/kb/troubleshooting/how-to-change-max-database-connections-_BQ8P5
- https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-credits-baseline-concepts.html

## Final release and remaining checks

Release 1afda3f was promoted successfully from a checksum-verified artifact
(SHA-256 b1c98e8b0c80c2ef438c9b2ea09691422616e4ce74f9565998fe2f9c1aeafffb).
All 15 public routes passed the candidate and live checks. The authenticated
post-deploy check also passed admin SSR and student admin-API denial.
The browser confirmed the bundled teacher Monaco editor renders the student's
shared code and contribution legend (E2E Student 100% of attributed edits, with
untouched starter code excluded).

Remaining observed polish: the practice question title had poor contrast against
its light background; the Learn catalog advertises four NASM lessons while its
course detail currently lists two. These should not be mistaken for completed
content or a fully polished UI. Long initial classroom loads were visible; the
new bundled editor removes one CDN dependency, but does not remove cross-region
auth/document requests. A sustained multi-student performance test remains open.
