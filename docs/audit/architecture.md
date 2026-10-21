# Architecture

Audited tree: `/workspace`, git `4a8317e` on `main` at the start, clean working tree. Remote: `Muhammad-Fahad-Javed/outputtracer`.

## Stack confirmed from files

- Next.js `16.3.1`, React `19.2.8`, TypeScript, Tailwind CSS 4 (`package.json`).
- Custom server `server.ts` via `tsx`. Scripts: `dev`, `build` (`next build`), `start` (`NODE_ENV=production tsx server.ts`), `lint`, `test` (`vitest run`).
- Monaco, xterm.js, Yjs / y-monaco / y-protocols, Supabase SSR, Cloudflare Turnstile.
- Execution: `g++`, optional `gdb`, optional `nasm`, `prlimit`, `unshare`, optional `bubblewrap` (`src/lib/sandbox.ts`).
- There is no `middleware.ts`. Next.js 16 uses `src/proxy.ts` (the renamed middleware convention).

Node on the audit host: v22.23.3. `g++`, `python3`, `prlimit`, and `unshare` are present. `gdb`, `nasm`, and `bubblewrap` are not.

## Directory map

| Path | Role |
| --- | --- |
| `src/app` | App Router pages and route handlers |
| `src/components` | IDE shell, auth, learn, classroom UI, assembly, Python lab |
| `src/lib/cppRunner.ts`, `gdbTracer.ts`, `sandbox.ts` | C++ compile, run, trace, isolation |
| `src/lib/asm` | Builtin assembler and 8086 emulator; optional native `nasm` |
| `src/lib/python` | Python API client; Docker worker is separate |
| `src/lib/classroom` | Classrooms, grading, messages, roles |
| `src/lib/learn` | Courses; database with an in-memory seed fallback |
| `src/lib/cloud` | Projects, groups, Yjs collaboration |
| `src/lib/practice.ts`, `data/questions` | Static practice bank (220 questions) |
| `supabase/migrations` | `0001` through `0013` |
| `sandbox-worker` | Python Docker worker |
| `scripts/deploy-production.sh` | EC2/PM2 candidate build and promote |
| `deploy.sh` | Older Docker installer aimed at `outputtracer.devs.surf` |
| `server.ts` | HTTP server plus `/ws/terminal` and `/ws/collab` |
| `curriculum/python-curriculum.json` | Draft. No importer references it |

`node_modules` and `.next` are generated and gitignored.

## Request lifecycle

1. `server.ts` listens on `PORT` (default 3000).
2. Upgrades to `/ws/terminal` and `/ws/collab` are handled by `ws` after an Origin check (`src/lib/wsOrigin.ts`) and a rate limit.
3. Every other request goes to the Next.js handler.
4. `src/proxy.ts` redirects `www.outputtracer.com` to the apex, then `updateSession` refreshes the Supabase cookie and requires a user for `/projects`, `/groups`, `/p`, and `/admin`.

## Code execution lifecycle

`POST /api/predict` and `/ws/terminal` write sources into a private temp directory and call `planSandboxedCommand`. Preference: bubblewrap, then `unshare --net`, then `prlimit`, then refuse when isolation is `none` in production. The child environment is an allow-list (`sanitizedChildEnv`). A successful predict run may start a second execution under GDB. Grading now sends `trace: false` so that second run is skipped.

`prlimit` is not a filesystem sandbox. The README states that. Bubblewrap is the only mode that hides host files.

## Authentication lifecycle

Email and Google sign-in go through Supabase in the browser (`AuthForm`). The OAuth return is `src/app/auth/callback/route.ts`, which allows only a same-origin `next` path (`safeNextPath`) and an allow-listed host (`requestOrigin`). Platform admin is `app_roles.role = 'admin'` or `ADMIN_USER_IDS`, read on the server (`checkIsAdmin`). It is not a query parameter or `user_metadata` field. Teacher status is `teacher_profiles.status = 'approved'`.

## Classroom workflow (as implemented)

A verified teacher creates a classroom and a join code. A student joins with the code. The teacher can create an assignment; the service stores a hello-world starter and empty test arrays. The class page lists assignments. The assignment page is read-only and links to `/`. Submit, execute, grade, rubric, and discussion endpoints exist. Several of them passed the classroom id and the user id to `getClassroom` in the wrong order, so they rejected every real member. This branch corrects that order and checks that the assignment belongs to the classroom on execute, submit, and grade.

## Build and deploy

`npm run build` writes `.next` unless `NEXT_DIST_DIR` is set. `scripts/deploy-production.sh` builds into `.next-candidate`, smokes it on port 3100, renames the live `.next` to `.next.prev`, promotes the candidate, and restarts PM2. After promotion, a failed health check now swaps `.next.prev` back. `scripts/rollback.sh` does the same swap on demand. `deploy.sh` is a separate, older Docker/Nginx path and still names `outputtracer.devs.surf`.

## Duplication and unused code

- `src/lib/cloud/roles.ts` is project membership (`owner`, `editor`, `viewer`). `src/lib/classroom/roles.ts` is platform capability (admin, verified teacher). Same filename, different systems.
- Unmounted components: `Hero.tsx`, `FAQ.tsx`, `HowItWorks.tsx`, `Topics.tsx`, `WhyOutputTracer.tsx`, `ExamplePrograms.tsx`, `SeoContent.tsx`, `Predictor.tsx`. The live home page is `UnifiedShell`.
- `mockPredict` in `src/lib/examples.ts` is only used by the unmounted `Predictor`.
- `curriculum/python-curriculum.json` is unused.
