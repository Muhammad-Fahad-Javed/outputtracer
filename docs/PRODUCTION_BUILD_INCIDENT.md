# Production build incident: the release that never landed

Date: 2026-10-21
Scope: `https://outputtracer.com` (AWS EC2, Amazon Linux 2023, PM2 + Nginx)
Status: root cause confirmed. The release is built off the host and promoted
as a verified artefact, so the instance does not have to change. The
artefact path still has to be merged into `main` before it can be promoted.

---

## 1. Symptom

`next build` compiled successfully and then stopped at `Running TypeScript`.
The build never produced a usable `.next`, so the live site kept serving the
previous release while the repository moved on by 30 commits.

Evidence collected on the host:

| Observation | Source |
| --- | --- |
| Build stopped during `Running TypeScript` | build log |
| `buildStage: "type-checking"` | `.next/diagnostics/build-diagnostics.json` |
| `useBuildWorker: "false"` | same file, `buildOptions` |
| Standalone `tsc --noEmit --pretty false --incremental false` **passed** | run by hand on the host |
| Failed build preserved as `.next.failed.20261021122945/` | filesystem |
| Older `.next` restored, site stayed up | filesystem |
| Instance: **913 MB RAM**, 2 vCPU, 8 GB disk, 1 GB swap | `free -m`, `df -h` |

---

## 2. What the diagnostics actually mean

`useBuildWorker: "false"` looks like a cause but is not one. In
`node_modules/next/dist/build/index.js:930`:

```js
const useBuildWorker =
  config.experimental.webpackBuildWorker ||
  (config.experimental.webpackBuildWorker === undefined && !config.webpack);
```

`useBuildWorker` is `false` purely because `next.config.ts` defines a custom
`webpack` function. It is recorded during the **compile** stage
(`buildStage: 'compile'`, `buildOptions.useBuildWorker`) and is only consulted
on the webpack code path. A Turbopack build never uses it.

Proof: the local build of this repository produced the same trace tags and
succeeded.

```
.next/trace: {"name":"next-build","duration":127617846,
  "tags":{"buildMode":"default","version":"16.3.1","bundler":"turbopack",
          "has-custom-webpack-config":"true","use-build-worker":"false"}}
```

`buildStage: "type-checking"` is the last stage the build reached. It says
where it stopped, not why.

The `webpack` function is **kept**: Next.js 16 still ships the webpack
fallback (`next build --webpack`), so it is live code. The Monaco Editor alias
it carries is also present in the Turbopack path
(`turbopack.resolveAlias`), and the build output confirms the ESM path is
resolved away:

```
$ grep -r "monaco-editor/esm/vs/editor/editor.api" .next/static
(no matches - the alias is applied)
```

---

## 3. Confirmed root cause: the instance does not have enough memory

Next.js 16.3.1 runs the TypeScript check through the CLI, not the language
service. `experimental.useTypeScriptCli` defaults to **true**
(`node_modules/next/dist/server/config-shared.js`), so
`next/dist/lib/typescript/runTypeCheckCli.js` runs:

```
tsc --project tsconfig.json --noEmit --declarationMap false \
    --emitDeclarationOnly false --tsBuildInfoFile <cacheDir>/.tsbuildinfo
```

The check is therefore real and strict. It is also the step that needs the
most memory, because it overlaps with the compiler that is still resident in
the parent process.

Measured on this repository (Node 22, Windows, 8+ cores, clean `.next`),
sampling the resident set of every `node` process every 500 ms:

| Stage | Concurrent RSS |
| --- | --- |
| Build start | 8 MB |
| Turbopack compile | rises to **1393 MB** |
| TypeScript worker starts (sample 21) | 921 MB -> **1211 MB** |
| Static generation | **peak 1896 MB** |

The compiler's memory is released only at the end of the build, so the type
check runs while ~1.2-1.4 GB is still held by the parent process.

**The host has 913 MB of RAM.** The build needs ~1.9 GB. The type-check worker
is the first allocation that cannot fit, which is exactly where the build
stopped. On a box that small the failure is not a clean error: the worker is
swapped out or OOM-killed, so the build either thrashes for a long time
(reads as "stalled") or dies with the worker disappearing.

### Why the standalone check passed

`./node_modules/.bin/tsc --noEmit --pretty false --incremental false` runs with
no build info file and no incremental state, so it is a single clean
non-incremental pass. It needs the same ~600 MB of program, but it is the
only thing running, so it fits. That difference is the whole story: **the
code is type-clean, the build simply cannot fit in RAM.**

A separate factor made it worse. To free disk space for the build, the 2 GB
swapfile on the host was reduced to 1 GB. That removed precisely the margin
the type-check worker needed:

```
before:  913 MB RAM + 2048 MB swap = 2961 MB   -> build could just fit
after:   913 MB RAM + 1024 MB swap = 1937 MB   -> below the ~1900 MB peak
```

### What was ruled out

| Hypothesis | Result |
| --- | --- |
| A genuine TypeScript error | **Ruled out.** Standalone `tsc --noEmit` passes; a type error would print a formatted diagnostic and exit immediately, not stall. |
| `useBuildWorker: "false"` | **Ruled out.** It is a compile-stage tag derived from the presence of a `webpack` function. A local build with identical tags succeeded. |
| A stale `.tsbuildinfo` | **Not reproduced.** A controlled reproduction of a stale build info file produced no error, and the candidate build's own cache is now isolated. |
| `--max-old-space-size` as a fix | **Measured and rejected.** Capping the V8 heap at 768 MB left the peak at 1959 MB, because the compiler's memory is native (Rust/Turbopack), outside V8's heap. |
| `experimental.cpus` | **Checked, not a factor here.** `getNumberOfWorkers` uses `cpus - 1` by default, which is already 1 on a 2 vCPU host. The 4-worker path only applies to `memoryBasedWorkersCount`. |

---

## 4. The fix

### 4.1 Infrastructure (required, on the host)

The build needs ~1.9 GB. The instance must offer that.

```bash
# 1. Grow the root volume so swap can be restored (no downtime, no reboot).
aws ec2 modify-volume --volume-id vol-XXXXXXXX --size 20 --region us-east-1
# wait for the volume to report the new size, then on the instance:
sudo growpart /dev/nvme0n1p1 1
sudo xfs_growfs /            # ext4: sudo resize2fs /dev/nvme0n1p1

# 2. Restore the swapfile to 2 GB.
sudo swapoff /swapfile
sudo truncate -s 2048M /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
free -m
```

That gives 913 MB RAM + 2048 MB swap = ~2961 MB against a ~1900 MB peak.

**Recommended:** resize the instance to `t3.medium` (4 GB RAM). The build is
comfortable, the runtime stops swapping, and the site gets faster. This needs
a stop/start, so schedule it.

**Recommended:** also stop the Nginx `X-Forwarded-For` appending and
overwrite it, otherwise `TRUST_PROXY=1` lets a client spoof the header and
bypass the rate limiters. See `docs/PRODUCTION_FIXES.md` section 4.4.

### 4.2 Code (this change set)

| File | Change |
| --- | --- |
| `next.config.ts` | `distDir` is now `NEXT_DIST_DIR` (default `.next`). A candidate can be built without touching the live release. Next derives `cacheDir` from `distDir`, so the candidate also gets its own Turbopack cache and its own `.tsbuildinfo`. |
| `scripts/deploy-production.sh` | New. Builds a candidate, verifies it, smoke tests it on a spare port, promotes it, health checks it, and rolls back automatically on failure. |
| `scripts/verify-release.sh` | New. Verifies the live release over HTTPS, including the release id and the absence of a staging-host redirect. |
| `scripts/rollback.sh` | New. Restores the previous release from `.next.prev`. |
| `.env.example` | Documents `NEXT_DIST_DIR`. |

`server.ts` is **unchanged**. It calls `next({ dev })`, which reads `distDir`
from `next.config.ts`, so the same server can serve a candidate build when
`NEXT_DIST_DIR` is set. That is what makes the smoke test possible without a
second code path.

### 4.3 Why a candidate directory

The live `.next` is the only thing the running server reads. Building over it
means a failed build leaves the site serving a half-written directory. The
candidate directory removes that class of failure entirely:

```
.next            live release, served by PM2
.next-candidate  release being built
.next.prev       previous live release, kept for rollback
```

The build now runs with the site fully up. The swap happens in a rename
between two `pm2 stop` and `pm2 restart`, so the outage is a few seconds, and
only after the candidate has already been proven good.

### 4.4 Release identification

`NEXT_DEPLOYMENT_ID` makes Next render `data-dpl-id="<id>"` on `<html>` and
tag asset URLs with `?dpl=<id>`. The deploy script asserts that the candidate
carries the expected id, that the live site carries it after the swap, and
that the id matches the deployed commit. No visible text was added to the
homepage for verification.

### 4.5 Building off the host (no instance change required)

Section 4.1 makes a build on the host possible by growing the volume and
restoring the swapfile. It is not required: the release can be built on a
machine with enough memory and promoted as a finished artefact. That removes
the memory requirement from the production host altogether.

```bash
# on a development machine, from the commit that is going to be released
node scripts/package-release.mjs
# -> release/outputtracer-release-<short-sha>.tar.gz  (+ .sha256)

# on the host
git fetch origin && git checkout main && git pull --ff-only origin main
scripts/deploy-production.sh --artifact release/outputtracer-release-<short-sha>.tar.gz
```

`scripts/deploy-production.sh --artifact` never runs a build. It verifies the
artefact's checksum, unpacks it into `.next-candidate`, checks the build
artefacts and the release id, smoke tests the candidate on a spare port and
only then promotes it. Every step before the promotion leaves the live
release untouched.

Two rules make this safe:

* **The artefact must be built from the commit that `main` points at.** The
  script compares the commit in the artefact's `RELEASE` manifest with the
  commit it has just pulled and refuses to promote a mismatch. The custom
  server (`server.ts`) and `src/lib` are executed from the checkout at
  runtime, not from the artefact, so the two have to be the same code.
* **The release id has to be baked in by the build.** Next renders
  `data-dpl-id` into the HTML while it builds, so the id cannot be added
  afterwards. `scripts/package-release.mjs` therefore puts
  `NEXT_DEPLOYMENT_ID` in the environment of the build it runs and uses the
  same value in the manifest. An artefact without the attribute cannot be
  identified on the live site and is rejected.

`scripts/package-release.mjs` uses `npm run build` when npm is installed and
the local Next.js CLI otherwise; both produce the same build.

---

## 5. Deployment

```bash
cd /home/ec2-user/outputtracer
git fetch origin
git checkout main
git pull --ff-only origin main

# Preflight only - reports disk, memory and the live release, changes nothing.
bash scripts/deploy-production.sh --verify-only

# Promote a release that was built elsewhere (recommended).
bash scripts/deploy-production.sh --artifact release/outputtracer-release-<short-sha>.tar.gz

# Full deploy: builds on this host first. Needs ~1.9 GB of memory and will
# refuse to start when the instance cannot offer that.
bash scripts/deploy-production.sh
```

The script refuses to start if the working tree is dirty, if there is not
enough free disk, or - when it has to build - if RAM + swap is too small.
It takes an exclusive lock so two deployments cannot overlap.

Pull `main` before running it. The script pulls `main` itself, but a script
that replaces itself while it is running keeps executing the version it
started with, so the `--artifact` option only exists once `main` has been
pulled.

### Rollback

```bash
bash scripts/rollback.sh
```

or manually:

```bash
cd /home/ec2-user/outputtracer
pm2 stop outputtracer
rm -rf .next && mv .next.prev .next
pm2 restart outputtracer --update-env
```

---

## 6. Open items for the operator

1. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` must be present in the host `.env` before
   the next release is built. The merged `AuthForm.tsx` fails closed: without
   the key, login, signup and Google OAuth all return "Security verification
   is not configured on this server". `NEXT_PUBLIC_*` is inlined at build
   time, so the key must be in `.env` **when the build runs**; adding it later
   requires a rebuild. When the release is built off the host, the key has to
   be in the `.env` of the build machine as well, not only on the host.
2. `SITE_URL` must be `https://outputtracer.com` and `TRUST_PROXY` must be
   `1` in the environment PM2 actually uses.
3. `www` needs a TLS certificate, otherwise the new apex redirect cannot
   reach browsers over HTTPS.
4. The lockfile in `main` was missing `@marsidev/react-turnstile`, so `npm ci`
   failed. Fixed in `fix/lockfile-turnstile` (commit `a1e1be1`).
