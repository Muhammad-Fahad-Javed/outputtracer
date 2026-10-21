# Deployment and rollback

Production deployment did **not** happen.

## Canonical path

`scripts/deploy-production.sh` is the deploy script. Its default public URL is `https://outputtracer.com`. It builds into `.next-candidate`, smoke-tests that directory, promotes it to `.next`, and keeps the previous build in `.next.prev`.

If PM2 fails to start, or a post-promotion health check fails, `rollback_promoted` moves the new `.next` aside and renames `.next.prev` back to `.next`, then restarts PM2.

This script was read. It was not run. Rollback was not exercised on a machine that was serving traffic.

A local production build was run with `NEXT_DIST_DIR=.next-verify` so it would not replace the dev server's `.next`. The build finished and printed the route table. That directory was deleted afterward. `tsconfig.json` was restored if the build rewrote it.

## Retired script

`deploy.sh` used to apt-install Nginx and Docker and configure `outputtracer.devs.surf`. It now exits 1 immediately and tells the operator to use `scripts/deploy-production.sh`. It does not touch a server.

## Database

Migrations are not part of the Next.js deploy. 0013 and 0014 must be applied separately, after a backup, on a staging database first. Applying them changes which columns and writes a user JWT can use. The service role used by the app bypasses RLS, which is how grading and progress are written.

## Before a production deploy

1. Install bubblewrap on the host and confirm `bwrap --version`. Without it, production C++ execution is refused.
2. Confirm gdb if traces are required. The binary output does not depend on gdb.
3. Set `TRUST_PROXY=1` only behind the real Nginx or Cloudflare hop, and set `TRUSTED_PROXY_HOPS` to match that chain.
4. Leave `ALLOW_FILESYSTEM_VISIBLE_SANDBOX` unset.
5. Leave `ENABLE_HSTS` unset until the certificate is confirmed, then set it to `1`.
6. Do not run `deploy.sh`.
7. Run `scripts/deploy-production.sh` from a clean tree of the intended commit.
8. `POST /api/predict` the hello-world program and expect `hi`.
9. Apply 0013 and 0014 only after the staging check, then repeat a student and teacher read of an assignment.
