# Executive summary

## Verified production state — 23 October 2026

OutputTracer is deployed at https://outputtracer.com/ from release `7b31d54` on EC2. The checkout is on `main` at `8fcd2ee`; the two later commits only repair deployment and security-test tooling. PM2 runs the Next.js service and the loopback-only Python sandbox worker.

The release verifier passed all 15 public routes, both protected redirects, all three configuration-gated routes, the canonical URL, and the `www` redirect. The live C++ API compiled and ran `CPP_OK` under Bubblewrap. The 8086 endpoint assembled a program with the built-in NASM-compatible engine. Python run returned `42`, and Python trace returned ordered steps, locals, and stdout through the authenticated Docker worker.

The Python worker uses a fresh container for each request with no network, a read-only root filesystem, a no-exec temporary filesystem, no Docker socket, UID 10001, dropped capabilities, and CPU, memory, PID, file, deadline, and output limits. All 11 adversarial checks passed on EC2. The shared worker token is stored only on the server in a mode-600 file and in the two PM2 process environments; its value was not printed.

The production C++ host now has Bubblewrap 0.10.0. Production-mode integration verified ordinary compilation, execution and GDB tracing, no inherited server secrets, no outside-file reads, and no outbound network access. `/etc/alternatives` is mounted read-only so Amazon Linux's linker symlink resolves without exposing the rest of `/etc`.

## Release validation

- Full Vitest suite: 48 files passed; 388 tests passed and 2 environment-dependent cases skipped.
- TypeScript: `tsc --noEmit` passed.
- ESLint: passed with no warnings.
- Production build: completed on EC2 with a valid `BUILD_ID` and release marker.
- Candidate smoke: 15 public routes returned 200, 2 protected routes redirected to login, and 3 configuration-gated routes failed safely.
- Live verification: the same route checks passed over `https://outputtracer.com`.
- PM2 promotion failure was exercised in production. The first promotion retained `NEXT_DIST_DIR=.next-candidate`; the guard rolled back and preserved the verified artifact. `scripts/deploy-production.sh` now explicitly sets `NEXT_DIST_DIR=.next` for both promotion and rollback.

## Database and authenticated flows

Migration `0016_teacher_self_service.sql` is loaded in the authenticated Supabase SQL editor and is waiting at Supabase's final destructive-query confirmation. Until it is applied, the teacher activation page will fail closed. Applied state for migrations `0013` and `0014` is still unknown. The EC2 app currently has no Supabase environment variables, so account-backed projects, groups, classroom persistence, and admin sessions show safe setup or access-restricted pages instead of using the production database.

## Remaining priorities

1. Apply and verify migration `0016`, then test teacher activation with a disposable authenticated user.
2. Determine whether migrations `0013` and `0014` are applied; apply them only after reviewing the live schema and backup state.
3. Configure the EC2 application with the Supabase URL, anon key, and service-role key without exposing values, then test real student, teacher, and admin sessions.
4. Complete authenticated browser workflows for assignment submission, grading, projects, groups, invitations, and realtime collaboration.
5. Review the 15 dependency advisories reported by `npm ci` without forcing breaking upgrades into this release.
