# Executive summary

## Verified state

OutputTracer is a Next.js 16 App Router application served by a custom Node server (`server.ts`) on https://outputtracer.com/. Cloudflare terminates TLS. The homepage, public labs, practice, and learn catalog returned HTTP 200 on 21 October 2026. `www` redirects to the apex with 308. HTTP redirects to HTTPS with 301. Anonymous users are redirected away from `/projects`, `/admin`, and `/learn/dashboard`.

The C++ compiler on the **live** site does not compile programs. `POST /api/predict` with a hello-world returned HTTP 200 and:

```text
g++: fatal error: no input files
compilation terminated.
```

The cause is in `src/lib/sandbox.ts`. When `prlimit` is installed, `prlimitPrefix` wrapped `g++` and dropped every compiler argument, including the source file. This host reproduced the same failure, then passed hello-world, infinite-loop timeout, and output-limit tests after the arguments were preserved. That fix is in this branch. It is not on the live host until the next production deploy.

Python execution is intentionally off in production (`POST /api/python` returns 503 `disabled`). The 8086 assemble endpoint works and reported engine `builtin-nasm-compat`.

## Core functionality

| Area | Live site, 21 Oct 2026 | This branch |
| --- | --- | --- |
| Public pages, login, signup, practice, learn, assembly UI | HTTP 200 | Unchanged routing |
| C++ compile and run | Broken (`no input files`) | Fixed and tested with `g++` under `unshare --net` |
| GDB trace | Not verified live; this host has no `gdb` | Trace can be skipped for grading; GDB still best-effort |
| Python | Disabled | Host fallback cannot run in production |
| 8086 assemble | Builtin assembler succeeded | Unit tests cover the emulator |
| Classroom assignment execute, submit, grade | Those handlers called `getClassroom` with the ids reversed, so members received 403 | Argument order fixed and tested |
| Learn answer keys | `answer` column is revoked; explanations still restated answers | Student payload blanks `explanation`; migration 0013 revokes the column |
| Auth roles | Server checks `app_roles` / `ADMIN_USER_IDS`, not the browser | Unchanged |

## Most important risks

1. **Live compiler outage (OT-001).** Every predict and terminal run that uses `prlimit` invokes `g++` with no files. Students cannot run C++.
2. **Database policies that the Next.js API does not enforce (OT-006).** Any signed-in user with the public anon key can read every profile email, read `hidden_test_cases`, and insert a submission row that already contains a grade. Migration `0013` closes these gaps. It has not been applied.
3. **Classroom write APIs were dead for real members (OT-002).** Fixed in this branch. The assignment page still has no submit button, so the student workflow is not complete even after the API accepts the caller.

## What requires attention before the next release

1. Deploy this branch with `scripts/deploy-production.sh` so the compiler fix and the classroom argument fix go live together. The script now restores `.next.prev` if the health check fails after promotion.
2. Apply `supabase/migrations/0013_close_privilege_gaps.sql` in Supabase **after** reading it. Do not disable row level security. The service role keeps writing grades and progress.
3. Confirm `POST /api/predict` prints `hi` for a hello-world, and that a teacher can open an assignment route that previously 403'd.
4. Do not enable `PYTHON_EXECUTION_ENABLED` until `PYTHON_SANDBOX_URL` and a token of at least 32 characters point at the Docker worker.

## Coverage and uncertainty

Routes were inventoried from `src/app` and probed with `curl` as an anonymous visitor. No student, teacher, or admin session was available, so authenticated UI flows were reviewed from source and unit tests, not clicked in production. Supabase was not connected from this environment, so row level security was reviewed from migrations and not executed against the live database. `gdb`, `nasm`, and `bubblewrap` are not installed here. Two bubblewrap integration tests were skipped for that reason. No Lighthouse score was collected.
