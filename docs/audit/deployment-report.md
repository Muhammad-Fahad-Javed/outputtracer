# Deployment

## What is live

https://outputtracer.com/ responds through Cloudflare (`server: cloudflare`). The app is Next.js (`x-powered-by: Next.js`, `x-nextjs-cache` on the homepage). This audit could not SSH to EC2, read PM2, Nginx, or the deployed git SHA. The live predict failure matches the `prlimitPrefix` bug in `4a8317e`, which is the current `main` commit. That is strong evidence the live build contains that function. It is not a `git rev-parse` on the server.

## Paths in the repo

| Script | What it does |
| --- | --- |
| `scripts/deploy-production.sh` | Lock, fetch `main`, build `NEXT_DIST_DIR=.next-candidate`, smoke port 3100, promote onto `.next`, `pm2 restart`. App dir default `/home/ec2-user/outputtracer` |
| `scripts/rollback.sh` | Swap `.next.prev` into `.next` and restart PM2. Does not reset git |
| `scripts/verify-release.sh` | Public routes 200, protected routes 307/308, rejects `devs.surf` redirects |
| `deploy.sh` | apt, Docker, Nginx for `outputtracer.devs.surf`. Not the apex runbook |
| `Dockerfile` | Node 22, `g++`, `gdb`, bubblewrap, `npm ci`, `npm run build`, user 1001 |

`.env.example` documents `SITE_URL=https://outputtracer.com`. Browser redirects use the request host (`requestOrigin.ts`), so a stale `SITE_URL` does not by itself send users to another domain.

## OT-009

The script header said a failed promotion rolls back. `fail` only printed and exited. After `.next` was replaced, a bad health check left the new build in place. This branch adds `rollback_promoted`, which moves the failed tree aside, restores `.next.prev`, and restarts PM2 before exiting. That function was not executed on a server.

## Release checks this branch expects

Public routes in the deploy script include `/`, `/login`, `/signup`, `/practice`, `/learn`, `/classroom`, `/assembly`, `/python`, `/examples`, robots, sitemap, and the login variants. Protected routes must redirect. `/admin` redirects only when Supabase env is set. A smoke box without those variables will fail the protected-route check. That matches `updateSession`.

## Not inspected

Nginx `upgrade` headers, PM2 cwd, disk, certificates beyond Cloudflare's HTTPS response, backups, and whether `.next` on the host matches `4a8317e`. Do not change DNS, firewall, or production env from this audit.
