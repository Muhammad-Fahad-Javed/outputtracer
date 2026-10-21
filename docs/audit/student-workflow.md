# Student workflow

No student account was signed in during this audit. Status comes from source, unit tests, and anonymous HTTP.

| Step | Status | Evidence |
| --- | --- | --- |
| Sign up / log in | Implemented, not executed with a mailbox | `AuthForm`, `/signup`, `/login/learner`. Callback restricts `next`. |
| Dashboard | Page exists | `/learn/dashboard` redirects anonymous users (live 307). Summary reads completions with the service role. Empty state links to `/learn/courses/cpp-fundamentals`, which the seed aliases to `cpp-mastery` only in the fallback. |
| Course catalog | Public | `/learn` 200. Seed has two courses. Database rows, if present, replace the seed when the query returns data (`getPublishedCourses`). |
| Lesson | Public content | Completion requires a user (`POST /api/learn/progress`). A signed-in student can mark a lesson complete without answering questions. That is what the button does. |
| Learn question | Server grades | Answer column is hidden. Explanation was in the page payload and is now blank until the grade response. |
| Practice | Works in the browser | 220 static questions. The answer is compared on the client. Progress is written to `practice_progress` from the browser when a session exists. |
| Open example in the IDE | Was broken | `Predictor` is not mounted, so `consumePendingExample` never ran. `UnifiedShell` now reads that key while initializing state. Practice used a different key; it now uses the same helper. |
| Run C++ | Broken live, fixed in branch | See compiler report. |
| Trace | Unverified live | GDB is optional. This host has no `gdb`. |
| Assembly exercise | Assemble works live | Builtin engine. Lesson "open in lab" writes `pending_asm_code`, which `AssemblyLab` reads. |
| Save a cloud project | Implemented behind login | `/projects` 307 for anonymous. Yjs sync requires an editor. |
| Classroom join | API exists | Hub page does not redirect anonymous users. It shows "Not enrolled" when `/api/classroom` returns 401. |
| Submit an assignment | API exists, page does not call it | `assignments/[assignmentId]/page.tsx` links to `/`. Execute and submit routes 403'd every member until this branch. |
| See a grade | API exists | Student view of `GET .../grade` omits hidden counts in the handler. |

Another student's project is gated by `project_role`. That RPC was not called with two live users. Unit tests cover classroom memory isolation (`classroom.test.ts` denies an outsider).
