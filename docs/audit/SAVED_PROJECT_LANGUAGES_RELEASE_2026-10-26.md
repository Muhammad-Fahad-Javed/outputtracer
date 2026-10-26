# Saved project languages — 26 October 2026

Application commit: `9568e4d`. Release: `projects-20261026-v5`.

## Saved work

The Projects page creates C++, Python and 8086 Assembly projects with matching
entry files and starter code. The C++ standard selector appears only for C++.
The library separates personal work, shared projects and classroom assignments,
and supports search, language filters, sorting and authorized workspace resume.
The language of an existing project remains fixed; create a new project to use
a different language. Existing C++ files and shared documents are preserved.

Saved projects open in the full-height collaborative editor, with file tabs,
live cursors, sharing permissions, a resizable editor/console split and source
downloads. C++ retains its trace view. C++ and Python consoles execute canonical
server-side shared source in private, authenticated sessions. Python snapshots
support up to 16 flat `.py` files and 64 KiB aggregate UTF-8 source, including
imports from helper files. The private Docker worker validates snapshots again,
writes them only inside a fresh container's bounded temporary filesystem and
retains the existing network, process, memory, CPU, input and output limits.
The legacy single-file worker request remains compatible.

NASM uses browser DOSBox, with shared source and input assets and private runtime
keyboard input and output files. The standalone and classroom runtime behavior
is documented in `BROWSER_DOSBOX_RELEASE_2026-10-26.md`. Project binary assets
must use the validated asset operations; raw Yjs updates and REST snapshots
cannot replace them. Source and input files persist; private output is saved
to the shared project only through an explicit action.

Migration `0027_saved_project_languages.sql` was explicitly approved and applied
after a private backup of the existing project tables and documents. It adds
language metadata, retains the old C++ creation RPC, and replaces recursive
group-read policies with caller-bound membership checks. Unrelated accounts
remain unable to see the group. No coursework was deleted.

Normal browser sign-in also exposed a student-dashboard query failure. The
route now uses canonical `profiles.display_name` and removes an unused ambiguous
classroom-group relationship embed. This preserves the existing access scope.
Private project pages also have neutral browser-tab titles. The collaboration
relay no longer publishes an empty local presence that looked like an extra
student; only connected browser participants appear in the count.
Persisted NASM asset maps are copied to plain objects at the React server/client
boundary. This fixes a reload error for both empty and populated input maps
without changing the validated stored document.

## Validation

- App suite: 569 passed, 2 existing skips. TypeScript and ESLint passed.
- Python worker suite: 32 passed, including actual fixed Python bootstrap
  imports, input spaces, per-run file isolation, syntax diagnostics, limits,
  authenticated WebSocket requests and Docker argument isolation checks.
- All 50 private preview checks in `scripts/test-saved-project-languages.mjs`
  passed using disposable accounts. They cover legacy and new creation,
  collaboration, canonical private consoles, multi-file Python, permission
  revocation, viewer/outsider denial, durable NASM binary assets, forged update
  rejection, library language/context labels and revoked-access resume fallback.
- The student-dashboard correction passed its 9 focused regression tests.
- All 51 saved-project checks passed against the final public production release,
  including a real page render with persisted NASM input assets.
  Read-only dashboard checks passed in preview and production, including exact
  teacher-name comparisons against canonical profiles.
- The final production build, guarded promotion and all 15 public route health
  checks passed. Read-only preview page-render checks passed for saved NASM
  projects with both empty input maps and binary input files.
- Browser checks verified Python/NASM creation controls, removal of the unrelated
  C++ standard field, NASM project creation, visible saved source, console resizing
  and an actual browser DOSBox run displaying `Saved NASM project works`.
  The browser project was then reloaded and run again with its saved source;
  the correct neutral tab title and one-participant count were visible.

Preview services were stopped after verification. The existing Python worker
was healthy and idle when updated, and remained healthy afterward. Browser
proofs are saved locally at `/tmp/outputtracer-projects-upgrade-live.png` and
`/tmp/outputtracer-saved-nasm-browser-proof.png`. The final private production
report is `/tmp/outputtracer-projects-production-qa-v5.json` on EC2.

Credentials and service keys are never included in the QA reports or this log.
The QA script retains its clearly named disposable project fixtures and records
their IDs in a private report; it does not remove existing student work.
