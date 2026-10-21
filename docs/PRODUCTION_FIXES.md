# Production incident audit — redirect, Server Action and deployment

Scope: `https://outputtracer.com` (AWS EC2, Amazon Linux 2023, PM2 + Nginx).
This document records only verified findings and the exact operational steps.
No secrets belong in this file.

## 1. Verified root causes

### 1.1 Cross-origin login redirects (the CORS error)

**Symptom**

```
Access to fetch ... https://outputtracer.devs.surf/login?next=%2Fprojects ...
blocked by CORS policy: Redirect is not allowed for a preflight request.
```

**Cause**

`src/lib/supabase/updateSession.ts` redirected unauthenticated requests with
`new URL("/login", requestOrigin(request))`, and `requestOrigin()` preferred
`process.env.SITE_URL` over the request host:

```ts
const configured = (process.env.SITE_URL ?? "").trim();
if (configured) return new URL(configured).origin;   // ← always wins
```

While `SITE_URL` still pointed at `https://outputtracer.devs.surf`, a browser on
`outputtracer.com` was redirected cross-origin. Browsers reject that for
fetch/preflight requests, so client navigation failed with the message above.

The redirect only happens for requests that carry an `sb-*` cookie (expired or
invalid session). Requests without a Supabase cookie return the login page with
HTTP 200, which is why the bug looked intermittent.

**Reproduced locally** against the pre-fix code with `SITE_URL` set to the
staging origin:

| SITE_URL | Host | Redirect Location |
| --- | --- | --- |
| `https://outputtracer.devs.surf` | `outputtracer.com` | `https://outputtracer.devs.surf/login?next=%2Fprojects` |
| `https://outputtracer.devs.surf` | `www.outputtracer.com` | `https://outputtracer.devs.surf/login?next=%2Fprojects` |

**Fix** — `src/lib/supabase/requestOrigin.ts` now prefers the request host, but
only for known hosts (canonical apex/www, the host in `SITE_URL`, or loopback
outside production). Unknown/spoofed hosts fall back to `SITE_URL`, then the
production canonical origin. Redirects are now always same-origin.

Verified after the fix (server started with the stale staging `SITE_URL`):

| Request | Result |
| --- | --- |
| `Host: outputtracer.com` → `/projects` | `307 https://outputtracer.com/login?next=%2Fprojects` |
| `Host: www.outputtracer.com` → `/projects` | `308 https://outputtracer.com/projects` |
| `Host: 127.0.0.1:3000` → `/practice` | `200` |

### 1.2 `www` served a duplicate site instead of redirecting

`https://www.outputtracer.com/` returned `200` (verified) while every page
declared `https://outputtracer.com` as canonical. `src/proxy.ts` now issues a
`308` (method-preserving) redirect for the `www` host before auth runs.

### 1.3 Server Action error `Received "x"`

**Symptom**

```
Error: The Server Reference ID did not match the expected format. Received "x".
```

**Cause** — malformed/automated request, not a build mismatch.

Reproduced locally by sending `next-action: x` to `/`:

```
Error: The Server Reference ID did not match the expected format. Received "x".
Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
 POST / 404
```

The message is Next.js error `E1442`, raised before any manifest lookup when the
header is not a valid action id. Valid ids in this build are 42 lowercase hex
characters (checked in `.next/server/server-reference-manifest.json`). A genuine
client/server version skew produces a different error — `E974`, "Failed to find
Server Action. This request might be from an older or newer deployment."

**Fix** — no application code change: the request is invalid and gets a 404.
Version-skew protection was added (see 1.4). An optional Nginx rule that drops
only obviously invalid ids is in section 4.3; it is deliberately not enabled by
default because it must be re-checked on every Next.js upgrade.

### 1.4 Version skew had no protection

`next.config.ts` had no `deploymentId`, so a browser still running the previous
release could call Server Actions or chunks that no longer existed after a
deploy.

**Fix** — `deploymentId` is now read from `NEXT_DEPLOYMENT_ID` (or
`DEPLOYMENT_ID`) at build time. Verified in the local build:

- `data-dpl-id="verify-dpl-1"` on `<html>`
- 293 asset URLs contain `?dpl=verify-dpl-1`
- id persisted in `.next/required-server-files.json`; still set the same value
  in the runtime environment so a later rebuild cannot drift from it.

### 1.5 Student source could be sent to a third-party host

`src/lib/classroom/executionClient.ts` built the internal `/api/predict` URL as:

```ts
process.env.NEXTAUTH_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("supabase.co", "vercel.app") ??
  "http://localhost:3000";
```

With `NEXTAUTH_URL` unset, `https://<ref>.supabase.co` became
`https://<ref>.vercel.app` — a host this project does not control — and student
code/submissions were POSTed there. Fixed to loopback
(`http://127.0.0.1:$PORT`, overridable with `INTERNAL_BASE_URL`).

### 1.6 Server-generated email links fell back to localhost

`src/lib/classroom/teacherService.ts` used
`process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"` for admin/teacher
notification links. If the optional public variable was absent in production,
those emails linked to localhost. Now uses `siteUrl()`, which falls back to
`https://outputtracer.com` in production and accepts `SITE_URL` first.

## 2. Production state observed (read-only probes)

| Check | Result |
| --- | --- |
| `GET /projects` (no cookie) | `200` login page |
| `GET /login` | `200`, title `Online C++ Compiler`, canonical `https://outputtracer.com` |
| `GET /www.outputtracer.com/` | `200` (no apex redirect) |
| `GET /python` | `404` |
| `GET /login/learner`, `/login/teacher`, `/login/admin` | `404` |
| `GET /classroom/student`, `/classroom/teacher` | `404` |
| `GET /assembly` | `200`, title `8086 NASM Assembly Lab` (old) |
| `GET /sitemap.xml` | 235 URLs, no `/python`, no `/assembly` |

**Conclusion: production is running an older build than this branch.** The
branch contains routes that 404 in production, and the production sitemap is two
URLs short of the branch sitemap. This must be resolved before diagnosing
further Server Action errors. The branch is 28 commits ahead of `origin/main`
(and 1 behind — `a8038bc`, which only adds `outputtracer-python.zip`).

Do not merge or force-push to fix this without an explicit decision on which
branch is the production branch.

## 3. Code changes in this pass

| File | Change |
| --- | --- |
| `src/lib/supabase/requestOrigin.ts` | Known-host allowlist; request host wins over a stale `SITE_URL`; no open redirect |
| `src/proxy.ts` | `www` → apex `308` redirect before session refresh |
| `src/lib/canonicalHost.ts` | Pure, tested host parsing for the redirect |
| `src/lib/siteUrl.ts` | Production-safe absolute URL for emails |
| `src/lib/classroom/teacherService.ts` | Use `siteUrl()` instead of localhost fallback |
| `src/lib/classroom/executionClient.ts` | Internal fallback is loopback, not a derived third-party host |
| `src/lib/cloud/roles.ts` | `safeNextPath` rejects control chars and normalises through `URL` |
| `next.config.ts` | `deploymentId` for version-skew protection |
| `.env.example` | `SITE_URL`, `TRUST_PROXY`, `NEXT_DEPLOYMENT_ID`, Turnstile, sandbox and CI variables documented; PM2 env-precedence warning |
| 5 test files (new) | 23 regression tests |

## 4. Required production configuration (manual, no secrets printed)

### 4.1 Which value is the process really using?

Next.js does **not** override variables that already exist in `process.env`.
If PM2 or an ecosystem file exports `SITE_URL`, editing `.env` alone changes
nothing. Print only the non-secret keys:

```bash
pm2 env "$(pm2 id outputtracer | tr -d '[] ')" \
  | grep -E '^(SITE_URL|NEXT_PUBLIC_SITE_URL|TRUST_PROXY|NEXT_DEPLOYMENT_ID|NODE_ENV)='
```

Expected:

```
SITE_URL=https://outputtracer.com
TRUST_PROXY=1
```

Then confirm the file the app reads:

```bash
grep -E '^(SITE_URL|TRUST_PROXY|NEXT_DEPLOYMENT_ID)=' /home/ec2-user/outputtracer/.env
```

If PM2 supplies a different value, update the PM2 environment (or remove it)
and restart with `--update-env`. Do not print the whole environment.

### 4.2 `TRUST_PROXY=1`

All rate limiters call `clientIpFromForwarded(..., trustProxy)`. Behind Nginx the
socket address is `127.0.0.1`, so without `TRUST_PROXY=1` every visitor shares
one bucket: 20 `/api/predict` runs and 8 WebSocket connections **per minute for
the whole site**. Set it in the PM2 environment after confirming Nginx
overwrites `X-Forwarded-For`.

### 4.3 Optional Nginx rule for malformed Server Action probes

Only if the log noise is material. This blocks values too short to be any known
action id, and leaves legitimate ids untouched. Re-verify after every Next.js
upgrade.

```nginx
map $http_next_action $bad_next_action {
    default          0;
    "~^[A-Za-z0-9_-]{16,}$" 0;
    "~."             1;   # header present but implausibly short/invalid
}

# inside the existing server { } block, before location /
if ($bad_next_action) {
    return 400;
}
```

Test from a shell before reloading:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'next-action: x' -H 'Content-Type: text/plain;charset=UTF-8' \
  --data '[]' https://outputtracer.com/            # expect 400
```

Do **not** use a 42-hex-only rule unless you re-check
`.next/server/server-reference-manifest.json` after every upgrade.

### 4.4 Nginx header hygiene

Ensure the proxy block sets the public host/proto and overwrites forwarded
headers (do not pass client-supplied `X-Forwarded-*` through):

```nginx
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;
proxy_http_version 1.1;
proxy_set_header Upgrade           $http_upgrade;
proxy_set_header Connection        "upgrade";
```

### 4.5 Supabase / Google OAuth

No code change is required, but the provider allow-lists must contain the
production callback only:

- Supabase → Authentication → URL Configuration → Site URL:
  `https://outputtracer.com`
- Redirect URLs: `https://outputtracer.com/auth/callback`
- Google console → Authorized redirect URI:
  `https://<project-ref>.supabase.co/auth/v1/callback` (Supabase's callback,
  not the app's)

Add `https://outputtracer.devs.surf/auth/callback` only if that host is still an
intentional staging environment. Keep `http://localhost:3000/auth/callback` for
local development.

## 5. Deployment runbook

Disk observed on the host: ~8 GB total, previously 95% used. A production
`.next` is ~300 MB (the local 1.06 GB includes a 769 MB `.next/dev` directory —
never build or run `next dev` on the production host). `node_modules` is
~772 MB. A build needs roughly 1 GB of free space plus the old `.next`.

### 5.1 Read-only checks (run first)

```bash
cd /home/ec2-user/outputtracer

df -h /
free -m
du -sh .next node_modules 2>/dev/null
du -sh .next/* 2>/dev/null | sort -h | tail
pm2 list
pm2 describe outputtracer | grep -E 'status|script path|exec cwd|exec mode|instances|restarts'
pm2 logs outputtracer --lines 50 --nostream | tail -50
git status --short
git branch --show-current
git log --oneline -5
```

Gate: do not build unless `df -h /` shows at least ~1.5 GB free and
`free -m` shows usable memory. Reclaim only files you have identified (see
5.2); never delete `.env`, database data, TLS certificates or logs without
approval.

### 5.2 Safe space recovery (with approval)

```bash
npm cache clean --force
# old PM2 logs (keeps the current file open):
pm2 flush outputtracer
# inspect before deleting any backup directory:
du -sh /home/ec2-user/outputtracer.bak* 2>/dev/null
```

`journalctl --vacuum-size=200M` and package cache cleanup are safe but require
sudo; confirm first.

### 5.3 Build and swap (brief downtime; PM2 is fork mode)

```bash
cd /home/ec2-user/outputtracer
git fetch origin
git status --short            # must be clean; stop and inspect otherwise
# after the branch decision:
git checkout <production-branch>
git pull --ff-only

export NEXT_TELEMETRY_DISABLED=1
export NEXT_DEPLOYMENT_ID="$(git rev-parse --short HEAD)"

# Keep the last good build for rollback (same filesystem, no copy cost):
rm -rf .next.prev
mv .next .next.prev

pm2 stop outputtracer
# If the build fails, restore .next.prev before starting again.
if npm run build; then
  pm2 start outputtracer
else
  echo "BUILD FAILED - restoring previous build"
  rm -rf .next
  mv .next.prev .next
  pm2 start outputtracer
  exit 1
fi
```

Notes:

- `pm2 reload` only avoids downtime in cluster mode. This app is a single fork
  process, so the restart is a short outage.
- Do not run `next build` while the old process is serving from the same
  `.next`; the build overwrites chunks in place.
- If Cloudflare is in front of the site, purge cached HTML after the deploy (or
  keep HTML out of the cache). Static pages are served with
  `Cache-Control: s-maxage=31536000`; a cached copy of an old page points at
  chunk files that the new build no longer has. Today Cloudflare reports
  `cf-cache-status: DYNAMIC`, so this is a precaution, not an active failure.
- If `npm` is unavailable on the host, use the repository's existing
  `node_modules/.bin/next build` path and document it.

### 5.4 Post-deploy verification

```bash
BASE=https://outputtracer.com
for p in / /projects /login /signup /practice /practice/basic-syntax/bs-01 \
         /learn /classroom /assembly /python /robots.txt /sitemap.xml; do
  printf '%-38s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")"
done

curl -sI "$BASE/projects" | grep -i '^location:'
curl -sI https://www.outputtracer.com/ | grep -iE '^(HTTP|location):'
curl -s "$BASE/sitemap.xml" | grep -c '<loc>'
```

Expected: `/projects` redirects to `https://outputtracer.com/login?...` (never
`devs.surf`), `www` returns `308` to the apex, sitemap count matches the build.

Browser check: open DevTools → Network, sign out, visit `/projects`, confirm the
redirect is same-origin and no CORS error appears.

## 6. Rollback

Code and build roll back independently:

```bash
cd /home/ec2-user/outputtracer

# 1. Application build rollback (no git history rewrite):
pm2 stop outputtracer
rm -rf .next
mv .next.prev .next
pm2 start outputtracer

# 2. Code rollback (only if the source itself must revert):
git log --oneline -5
git checkout <previous-good-commit>
# rebuild, or restore the matching .next.prev as above
```

`.env` is untouched by both procedures. Never use `git reset --hard` or
force-push to roll back; check out the previous commit on a branch instead so
the current work remains recoverable.

## 7. Status

| Item | Status |
| --- | --- |
| Same-origin login redirects / stale `SITE_URL` | Fixed and tested |
| `www` → apex redirect | Implemented and tested locally; requires TLS cert for `www` + deploy |
| Malformed `next-action` probe (`Received "x"`) | Diagnosed as invalid traffic; no app fix required |
| Version-skew protection (`deploymentId`) | Implemented and verified in a local production build |
| Third-party leak of student source | Fixed and tested |
| Email links to localhost | Fixed and unit tested |
| `next-action` log filtering | Requires production configuration (optional) |
| `SITE_URL` / `TRUST_PROXY` in the running process | Requires production configuration |
| Production serving an older build | Unresolved — needs a branch/deploy decision |

## 8. Test and environment limitations

- Tests run on Windows. Linux-only sandbox tests (bubblewrap/prlimit) are
  skipped unless `REQUIRE_SANDBOX_TOOLS=1`; 6 tests were skipped.
- Production `NODE_ENV=production` on Windows correctly refuses unsandboxed
  execution (`execution_refused_no_isolation`); this is fail-closed behaviour,
  not a regression.
- AWS/PM2/Nginx were not modified: this session had no authorised access.
- A full authenticated browser flow (Google OAuth, classroom collaboration,
  WebSocket terminal) was not exercised because no test account/credentials
  were available in this environment.
