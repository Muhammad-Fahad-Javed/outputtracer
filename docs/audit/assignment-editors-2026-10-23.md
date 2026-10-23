# Assignment IDE and language integration

Assignment routes now open full-screen dark workspaces. Students have file tabs,
a resizable editor/output split, standard input, instructions, public tests,
collaborator presence, version saving, download, submission, and status controls.
Teacher inspection retains read-only collaboration, author highlights, contribution
shares, and classroom policy controls within a dark workspace.

New classrooms derive a canonical language from the selected subject. New assignments
inherit it or accept an explicit language override. Language travels through shared
document resolution, WebSocket update validation, snapshots, runs, and auto-grading.
NASM uses the existing isolated assembler and bounded emulator. Python uses the
existing sandbox worker. NASM results include final registers and flags.

Migration 0017 was applied through the authenticated Supabase SQL editor after user
approval. Result: 2 C++ classrooms, 1 asm8086 classroom, 3 preserved C++ assignments.
Existing assignments were not converted based solely on their classroom subject.
Create a new NASM assignment in the NASM classroom to use main.asm.

Verification: TypeScript, changed-file ESLint, production build, and diff checks pass.
Existing suite: 388 passed, 2 skipped. Seven additional language/inheritance cases pass,
including actual NASM assembly/emulation and no C++ HTTP dispatch. The browser preview
verified a live synchronized main.asm editor with the dark toolbar and output panels.

Current scope: Python and NASM assignments use one entry file (main.py/main.asm).
C++ retains multi-file support. Standard input is supplied before each run.
Assignment execution provides run/tests and NASM final machine state; interactive
terminal input, step debugging, memory/stack panes, activity-time measurement, and
manual-entry policies are not implemented by this release. No nonfunctional toolbar
buttons are shown for those capabilities.
