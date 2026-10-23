# Deployment

## Live release

The application is served through Cloudflare at https://outputtracer.com/ from EC2 checkout `/home/ec2-user/outputtracer`. The live artifact reports release `7731c0a` and build ID `build-TfctsWXpff2fKS`.

PM2 runs:

- `outputtracer`: the Next.js custom server on port 3000.
- `outputtracer-python-sandbox`: the authenticated Python worker on `127.0.0.1:8787`.

The process list is saved with `pm2 save`. The Python token is generated on the host, stored at `/home/ec2-user/.config/outputtracer/python-sandbox.token` with mode 600, and never logged. The Docker image is `outputtracer-python-sandbox:latest`.

## Guarded deployment result

`scripts/deploy-production.sh --build-on-host` typechecked and built a candidate without touching the live `.next`, verified its required manifests and release marker, then smoke-tested all route classes on port 3100. A stale earlier candidate server was detected by the release-ID check and blocked promotion. After that process was removed, the clean candidate passed.

The first promotion exposed that PM2 retains environment variables which disappear from a later `--update-env` call. It kept `NEXT_DIST_DIR=.next-candidate`, failed the health check, and the script preserved the failed artifact while restoring `.next.prev`. The previous `.next` was already corrupt and had no build ID, so the verified artifact was promoted manually and PM2 was restarted with `NEXT_DIST_DIR=.next`.

Commit `5b9cb14` fixes both promotion and rollback by explicitly passing `NEXT_DIST_DIR=.next`. This makes the release directory deterministic even when PM2 already contains a candidate value.

## Verified checks

- All 15 public routes returned 200 over HTTPS.
- `/learn/dashboard` and `/classroom/teacher` redirected anonymous users to login.
- Supabase is configured from a mode-600 `.env.production.local`; `/api/config` reports configured and anonymous `/projects`, `/groups`, and `/admin` requests redirect to login.
- The homepage carried `data-dpl-id="7731c0a"`.
- The homepage canonical is `https://outputtracer.com`; `www` redirects to the apex.
- C++, Python run, Python trace, and 8086 assembly succeeded through the deployed process.
- PM2 and the Python worker recovered through `pm2 kill` followed by `pm2 resurrect`; both health checks passed.

The corrupt pre-deployment artifact is preserved outside the repository at `/home/ec2-user/outputtracer-recovery/.next.broken-before-7b31d54`. The deployment script retains `.next.prev` on normal promotions for rollback.
