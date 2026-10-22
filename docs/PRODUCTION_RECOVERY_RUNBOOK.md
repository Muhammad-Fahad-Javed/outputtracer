# Production recovery runbook

Date: 2026-10-22
Scope: `https://outputtracer.com` (AWS EC2, Amazon Linux 2023, PM2 + Nginx)
Host: `/home/ec2-user/outputtracer`, PM2 app `outputtracer`

**Status at the time of writing: the site answers `502` on every route.**
Cloudflare is up and its origin is not. The steps below are ordered so that
the first one changes nothing. Run them one at a time and read the output
before running the next.

Do not run two deployment processes at the same time. Do not delete
`.next`, `.next-candidate` or `.next.prev` before step 3 has told you
which of them holds a complete build. Do not remove the deployment lock
until you have checked that its owner is gone.

---

## Step 1 - Establish the state (changes nothing)

```bash
cd /home/ec2-user/outputtracer

echo "== processes =="
ps -eo pid,ppid,etime,rss,args --sort=start_time | grep -E "deploy-production|next-build|next build|tsc|tsx" | grep -v grep || echo "(no build running)"

echo "== lock =="
ls -l /tmp/outputtracer-deploy.lock 2>&1 || echo "(no lock file)"
cat /tmp/outputtracer-deploy.lock 2>/dev/null
for p in $(ls /proc | grep -E '^[0-9]+$'); do
  ls -l /proc/$p/fd 2>/dev/null | grep -q "outputtracer-deploy.lock" && \
    echo "lock held by PID $p: $(tr '\0' ' ' < /proc/$p/cmdline)"
done

echo "== release directories =="
for d in .next .next-candidate .next.prev; do
  printf '%-16s ' "$d"
  if [ -d "$d" ]; then
    echo "BUILD_ID=$(cat $d/BUILD_ID 2>/dev/null || echo MISSING) size=$(du -sh $d | cut -f1)"
  else
    echo "(absent)"
  fi
done
ls -d .next.failed.* 2>/dev/null | tail -5

echo "== pm2 =="
pm2 list
pm2 describe outputtracer | grep -E "script path|exec cwd|status|restarts|uptime|interpreter"

echo "== nginx =="
systemctl is-active nginx
sudo nginx -T 2>/dev/null | grep -E "server_name|proxy_pass" | head -10

echo "== is the app itself answering? =="
curl -s -o /dev/null -w "127.0.0.1:3000/ -> %{http_code}\n" --max-time 10 http://127.0.0.1:3000/
curl -s -o /dev/null -w "127.0.0.1:3000/robots.txt -> %{http_code}\n" --max-time 10 http://127.0.0.1:3000/robots.txt

echo "== git =="
git rev-parse --abbrev-ref HEAD; git rev-parse HEAD; git rev-parse origin/main
git status --porcelain | head
git log --oneline -5

echo "== resources =="
free -m; swapon --show; df -h / | tail -1
sudo dmesg -T | grep -iE "oom-kill|Killed process" | tail -5

echo "== logs =="
tail -30 /tmp/deploy-run*.log 2>/dev/null
ls -lt /tmp/outputtracer-build.*.log 2>/dev/null | head -5
for f in $(ls -t /tmp/outputtracer-build.*.log 2>/dev/null | head -2); do echo "--- $f"; tail -20 "$f"; done
pm2 logs outputtracer --err --lines 30 --nostream
```

**What it decides**

| Observation | Meaning |
| --- | --- |
| a `deploy-production.sh` or `next build` process exists | a deployment is still running. Let it finish; do not start another one. |
| the lock is held by a PID that no longer exists | stale lock. `flock` releases on process exit, so this is harmless; the lock file itself can stay. |
| `.next/BUILD_ID` exists, PM2 is `online`, port 3000 answers | the release is fine and the problem is in front of it (nginx) or the machine. |
| `.next/BUILD_ID` missing, `.next.prev/BUILD_ID` exists | the live build directory is incomplete. Restore `.next.prev` (step 3). |
| port 3000 refuses connections | PM2 is not serving. Restart it (step 3). |

---

## Step 2 - Bring the site back up (reversible)

Pick the one case that matches step 1.

**2a. The app is not running, but `.next/BUILD_ID` exists**

```bash
cd /home/ec2-user/outputtracer
pm2 restart outputtracer --update-env
sleep 3
pm2 list
curl -s -o /dev/null -w "127.0.0.1:3000/ -> %{http_code}\n" --max-time 10 http://127.0.0.1:3000/
curl -s -o /dev/null -w "https://outputtracer.com/ -> %{http_code}\n" --max-time 20 https://outputtracer.com/
```

**2b. `.next` is incomplete (no BUILD_ID) and `.next.prev` is complete**

```bash
cd /home/ec2-user/outputtracer
ls .next.prev/BUILD_ID && bash scripts/rollback.sh
```

`scripts/rollback.sh` moves the previous release back to `.next`, restarts
PM2 and health-checks it. The broken directory is kept as
`.next.failed.<timestamp>`, so nothing is deleted.

**2c. Nginx is not running**

```bash
sudo systemctl restart nginx
curl -s -o /dev/null -w "https://outputtracer.com/ -> %{http_code}\n" --max-time 20 https://outputtracer.com/
```

---

## Step 3 - Publish the intended release without building on the host

The host cannot build this application: a `next build` needs about 1.4 GB
of resident memory for the Turbopack compiler and the instance has 913 MiB
of RAM. That is why previous deploys stopped in "Running TypeScript" and
why the kernel killed a build.

The release is therefore built on a development machine and promoted as an
artefact. `scripts/package-release.mjs` builds it,
`scripts/deploy-production.sh --artifact` promotes it. The artefact is
verified (sha256), unpacked into `.next-candidate`, checked (BUILD_ID,
manifests, release id), smoke tested on port 3100 and only then promoted.
A failure at any point before the promotion leaves the live release
untouched.

**3a. Make sure `main` contains the release scripts**

```bash
cd /home/ec2-user/outputtracer
git fetch origin
git checkout main
git pull --ff-only origin main
git log --oneline -3
```

The `--artifact` option does not exist in older versions of the script, so
pull before running it.

**3b. Copy the artefact onto the host**

```bash
# on the machine that built it
scp release/outputtracer-release-<short-sha>.tar.gz \
    release/outputtracer-release-<short-sha>.tar.gz.sha256 \
    ec2-user@<host>:/home/ec2-user/outputtracer/release/
```

The directory `release/` is git-ignored, so the archive does not make the
working tree dirty and the deploy script's clean-tree check still passes.

**3c. Promote it**

```bash
cd /home/ec2-user/outputtracer
bash scripts/deploy-production.sh --artifact release/outputtracer-release-<short-sha>.tar.gz
echo "exit=$?"
```

The script prints the commit it is deploying, verifies the checksum, the
build artefacts and the release id, smoke tests the candidate, promotes it
atomically, restarts PM2, health-checks the live site and rolls back
automatically if the health check fails.

**3d. Verify what is live**

```bash
cd /home/ec2-user/outputtracer
cat .next/RELEASE
cat .next/BUILD_ID
curl -s https://outputtracer.com/ | grep -o 'data-dpl-id="[^"]*"' | head -1
bash scripts/verify-release.sh
```

The `data-dpl-id` on the live homepage must equal the `release` in
`.next/RELEASE`, and that must be the commit you intended to publish.

---

## Step 4 - If the host has to build again

Only after the instance is bigger (t3.medium) or the swap is restored to
at least 2 GB:

```bash
cd /home/ec2-user/outputtracer
free -m            # available RAM + free swap must be >= 1400 MB
bash scripts/deploy-production.sh
```

The script type-checks in its own process first and then tells Next.js to
skip the second, in-build type check (`OUTPUTTRACER_DEFER_TYPECHECK=1` in
`next.config.ts`), because that second check runs while the Turbopack
compiler is still resident and is what the host ran out of memory on.
It also gates on *free* memory plus *free* swap, not on the totals: a
swap file that is full is not usable memory.

---

## Rollback

```bash
cd /home/ec2-user/outputtracer
bash scripts/rollback.sh
```

or by hand:

```bash
cd /home/ec2-user/outputtracer
pm2 stop outputtracer
mv .next .next.failed.$(date +%Y%m%d%H%M%S)
mv .next.prev .next
pm2 restart outputtracer --update-env
```
