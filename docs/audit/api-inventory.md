# API inventory

Handlers live under `src/app/api`. WebSockets are not HTTP routes: `/ws/terminal` and `/ws/collab` in `server.ts`.

Authentication is `supabase.auth.getUser()` inside the handler unless noted. The proxy does not protect `/api/*`.

| Method and path | Auth | Responsibility |
| --- | --- | --- |
| `GET /api` | Public | Compiler version health check |
| `GET /api/config` | Public | Supabase URL and anon key for the browser |
| `POST /api/predict` | Public, or project access when `projectId` is set | Compile and run C++. Rate limited. `trace: false` skips GDB |
| `POST /api/asm` | Public | Assemble and step an 8086 session |
| `POST /api/python`, `POST /api/python/trace` | Public when enabled | Proxy to the authenticated loopback Python worker. Live and verified 23 October 2026 |
| `POST /api/learn/progress` | User required to save. Guests can be graded | Grade a learn question or mark a lesson complete |
| `GET/PUT/DELETE /api/profile` | User | Profile allow-list. Does not write `email` or roles |
| `POST/DELETE /api/profile/avatar` | User | Image upload via the service role after a size and MIME check |
| `POST /api/projects/[id]/sync` | Editor token or cookie | Persist a Yjs snapshot |
| `GET/POST /api/classroom` | User | List or create classrooms |
| `POST /api/classroom/join` | User | Join by code as student |
| `GET /api/classroom/student/dashboard` | User | Student summary |
| `GET/POST /api/classroom/teacher/apply` | User | Teacher application |
| `GET/POST /api/classroom/notifications` | User | Read and mark notifications |
| `GET/POST /api/classroom/invite/[token]` | Mixed | Preview and accept an invite |
| `GET /api/classroom/[classId]` | Member | Class detail. Argument order was already correct |
| Classroom assignment execute, submit, grade, rubric, feedback, snapshot, versions | Member or teacher | **Were** calling `getClassroom(classId, user.id)`. Fixed to `(user.id, classId)` |
| `GET /api/classroom/[classId]/reports` | Teacher | Same argument fix. POST/PATCH delegate to services that call `getClassroom` correctly |
| Roster, groups, invitations, messages, announcements, discussions, gradebook export, progress | Member or teacher | Use `getClassroom(userId, classId)` inside services |
| `GET/POST/PATCH/DELETE /api/admin/*` | Admin via `checkIsAdmin` | Users, teachers, learn CMS, audit, invitations, moderation |

Input validation is per handler. Predict rejects oversized bodies (512 KB) before JSON parse. Asm checks source size only after `request.json()`.

Rate limits: predict, asm, python, terminal, collab, classroom execute. See `src/lib/rateLimit.ts` and `execConfig`. No application-wide limit.

Tests that hit these handlers: `classroomRouteAuth.test.ts` (argument order, 12 routes), `executionClient.test.ts` (predict body), `python.test.ts` (worker client). No HTTP integration test boots `server.ts`.
