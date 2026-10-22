# Feature inventory

Status values: working and verified, partially working, broken, implemented but unverified, missing, not applicable.

| Feature | Status | Evidence |
| --- | --- | --- |
| Homepage IDE shell | Partially working | Live 200. C++ run broken live (OT-001). Fixed in this branch and tested locally |
| C++ hello world, loops, output limit | Working and verified on the audit host after the fix | `cppRunner.test.ts` |
| C++ on production | Broken until this branch is deployed | Live `no input files` |
| GDB trace | Implemented but unverified | No `gdb` on the audit host. Trace steps were 0. Live not retested after the argv fix |
| Interactive terminal WebSocket | Implemented but unverified | `server.ts`, `wsTerminal.ts`. Not connected from a browser |
| Python lab page | Partially working | Page 200. API 503 `disabled` live, which is the safe state |
| Python Docker worker | Implemented but unverified | `sandbox-worker/` not started here |
| 8086 assemble | Working and verified | Live builtin assemble succeeded. 19 emulator tests passed |
| 8086 native nasm | Not applicable on this host | `nasm` missing. Production reported the builtin engine |
| Practice bank | Working and verified as static content | 220 questions. Client-side grading. Individual questions were not all opened |
| Learn catalog | Partially working | `/learn` 200. Database content versus seed was not queried |
| Learn grading | Implemented, answer hidden | `learn.test.ts`. Explanation leak reduced in this branch |
| Accounts | Implemented but unverified end to end | No mailbox or Google OAuth consent in this environment |
| Cloud projects and Yjs | Implemented but unverified | Login wall verified for `/projects`. No two-browser edit |
| Classroom hub | Partially working | Page 200. Logged-out state looks empty. APIs require a user |
| Assignment submit and grade UI | Missing | APIs exist. The assignment page does not call them |
| Assignment execute API | Broken live, fixed in branch | Swapped `getClassroom` arguments |
| Teacher apply and admin CMS | Implemented but unverified | Pages and handlers exist. No admin session |
| Realtime collab | Implemented but unverified | Origin check is unit-tested. No multi-user session |
| SEO canonicals | Partially working | Apex and www verified. Robots prefixes fixed in branch only |
| Service worker / PWA | Present, not audited in a browser | `public/sw.js` |
