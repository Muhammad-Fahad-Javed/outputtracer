# Administrator workflow

Admin is a server check, not a login form secret.

`checkIsAdmin` (`src/lib/learn/db.ts`) reads `app_roles` with the service role, or matches `ADMIN_USER_IDS`. It does not read `user_metadata` or the `role` query on `/signup`.

| Surface | Gate | What it can do |
| --- | --- | --- |
| `/admin` | Proxy requires a session. Page requires `checkIsAdmin` | Overview, users, audit list (`AdminDashboardManager`) |
| `/admin/teachers` | Same | Approve, reject, request info, suspend via `/api/admin/teachers` |
| `/admin/learn` | Same | Course and lesson CMS via `/api/admin/learn` |
| `/api/admin/users` | `checkIsAdmin` then service role | Change role among `admin`, `staff`, `student`, `teacher` (`0011` check) |
| `/api/admin/invitations` | Admin | Invite `admin` or `staff` |
| `/api/admin/moderation` | Admin | Archive a classroom, suspend a teacher. The dashboard displays `is_archived` and does not call this route |
| `/login/admin` | Shows a restriction panel if the signed-in user is not an admin | |

Live `/admin` without a cookie is 307 to `/login?next=%2Fadmin`.

`acceptAdminInvitation` returns success without writing `app_roles` when the service-role client is missing (`adminRoleService.ts`). That does not grant admin. It reports a false success. Still open.

There is no audit-log UI that cannot be forged until migration 0013 is applied: any signed-in user can insert `classroom_audit_logs` if the table grant allows it. The admin reader uses the service role.

Ordinary students cannot pass `checkIsAdmin`. That was confirmed by reading the function, not by logging in as a student.
