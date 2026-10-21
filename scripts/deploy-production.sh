#!/usr/bin/env bash
#
# OutputTracer production deployment.
#
# Design goals:
#   * The live build is never touched while a new one is compiling.
#   * A candidate release is verified (build artefacts, routes, live smoke
#     test) BEFORE the live release is replaced.
#   * Replacing the release is reversible and automatic on failure.
#   * Two deployments can never run at the same time.
#
# Release layout
#   .next          the live release (served by PM2)
#   .next-candidate  the release being built
#   .next.prev     the previous live release, kept for manual rollback
#
# The custom server (server.ts) calls next({ dev }), which reads distDir from
# next.config.ts. That file honours NEXT_DIST_DIR, so a candidate can be built
# and smoke tested on a spare port while the live release keeps serving.
#
# Usage:
#   scripts/deploy-production.sh              # full deploy
#   scripts/deploy-production.sh --verify-only  # verify the live release only
#
# Environment:
#   PM2_APP       PM2 process name (default: outputtracer)
#   DEPLOY_PORT   port used for the candidate smoke test (default: 3100)
#   BASE_URL      public base url used for the post-deploy health check
#
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ec2-user/outputtracer}"
PM2_APP="${PM2_APP:-outputtracer}"
DEPLOY_PORT="${DEPLOY_PORT:-3100}"
BASE_URL="${BASE_URL:-https://outputtracer.com}"
CANDIDATE_DIR=".next-candidate"
PREV_DIR=".next.prev"
LOCK_FILE="/tmp/outputtracer-deploy.lock"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
fail() { printf '\n\033[1;31m!!! %s\033[0m\n' "$*" >&2; exit 1; }

# The candidate is already the live directory. Put the previous release back
# before exiting so a failed health check does not leave the new build serving.
rollback_promoted() {
  local reason="$1"
  if [ -d .next ] && [ -d "$PREV_DIR" ]; then
    local failed_dir=".next.failed.$(date +%Y%m%d%H%M%S)"
    mv .next "$failed_dir"
    mv "$PREV_DIR" .next
    info "restored the previous release; failed release kept in $failed_dir"
    unset NEXT_DIST_DIR
    if ! pm2 restart "$PM2_APP" --update-env; then
      info "PM2 did not restart the restored release; check: pm2 logs $PM2_APP --lines 50 --nostream"
    fi
  else
    info "could not roll back automatically (.next or $PREV_DIR is missing)"
  fi
  fail "$reason"
}

# Next.js rewrites tsconfig.json during a build when the include patterns do
# not match the distDir in use. A candidate build therefore appends its own
# ".next-candidate/types/**" globs and reformats the file. tsconfig.json is a
# tracked file, so it is restored to its committed state once the build is
# over, otherwise the next run would fail the "clean working tree" check.
restore_tsconfig() {
  if [ -f "$APP_DIR/tsconfig.json" ] && ! git -C "$APP_DIR" diff --quiet -- tsconfig.json 2>/dev/null; then
    git -C "$APP_DIR" checkout -- tsconfig.json 2>/dev/null || true
    info "restored tsconfig.json (rewritten by the build)"
  fi
}
trap restore_tsconfig EXIT

# Routes that must answer 200 on a healthy release.
PUBLIC_ROUTES=(
  / /login /signup /practice /learn /classroom /assembly /python /examples
  /robots.txt /sitemap.xml /login/learner /login/teacher /login/admin
  /classroom/student
)
# Routes that must redirect an anonymous visitor to the login page.
PROTECTED_ROUTES=( /projects /groups /admin /learn/dashboard /classroom/teacher )

# --------------------------------------------------------------------- lock
# Only one deployment may run at a time.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  fail "another deployment is already running (lock: $LOCK_FILE)"
fi

cd "$APP_DIR"

# ----------------------------------------------------------- verify only
if [ "${1:-}" = "--verify-only" ]; then
  exec scripts/verify-release.sh
fi

# =========================================================== 1. PRE-FLIGHT
log "1. Pre-flight"

CURRENT_COMMIT="$(git rev-parse HEAD)"
CURRENT_BUILD_ID="none"
if [ -f .next/BUILD_ID ]; then
  CURRENT_BUILD_ID="$(cat .next/BUILD_ID)"
fi
info "current commit  : $CURRENT_COMMIT"
info "current BUILD_ID: $CURRENT_BUILD_ID"

# Record the live release so a rollback can be targeted precisely.
mkdir -p .next
printf '%s\n' "$CURRENT_COMMIT" > .next/RELEASE

DISK_FREE_MB="$(df -Pm / | awk 'NR==2 {print $4}')"
info "disk free       : ${DISK_FREE_MB} MB"
# The build needs roughly 1 GB of scratch space for .next-candidate plus the
# Turbopack cache. Refuse to start rather than fill the root volume.
if [ "$DISK_FREE_MB" -lt 1200 ]; then
  fail "only ${DISK_FREE_MB} MB free on /; need at least 1200 MB to build"
fi

# Turbopack compile for this app holds about 1.4 GB and, on the production
# host, completed (outputtracer-build.9K7gao.log: "Compiled successfully in
# 3.4min"). The in-build typecheck runs before that compiler is released, and
# that is where the same log stops, with no tsc diagnostic and no process
# left. Gating on total RAM + total swap called 913 MB + 1.4 GB "enough"
# while only ~1.45 GB was free. Require free memory instead.
MEM_TOTAL_MB="$(free -m | awk 'NR==2 {print $2}')"
MEM_AVAIL_MB="$(free -m | awk 'NR==2 {print $7}')"
SWAP_TOTAL_MB="$(free -m | awk 'NR==3 {print $2}')"
SWAP_FREE_MB="$(free -m | awk 'NR==3 {print $4}')"
HEADROOM_MB=$(( MEM_AVAIL_MB + SWAP_FREE_MB ))
info "memory          : ${MEM_TOTAL_MB} MB total, ${MEM_AVAIL_MB} MB available"
info "swap            : ${SWAP_TOTAL_MB} MB total, ${SWAP_FREE_MB} MB free"
info "build headroom  : ${HEADROOM_MB} MB (available RAM + free swap)"
if [ "$HEADROOM_MB" -lt 1400 ]; then
  fail "this build needs about 1400 MB free (available RAM + free swap) but only ${HEADROOM_MB} MB is free. Free memory or resize the instance before deploying."
fi

if [ -n "$(git status --porcelain)" ]; then
  # A previous run that was killed mid-build can leave tsconfig.json rewritten
  # by Next.js. That is a generated change, not user work, so restore it and
  # re-check before refusing to continue.
  restore_tsconfig
fi
if [ -n "$(git status --porcelain)" ]; then
  fail "working tree is not clean; commit or stash the changes first"
fi
info "working tree    : clean"

# ============================================================== 2. PULL
log "2. Fetch and fast-forward main"

git fetch origin
git checkout main
git pull --ff-only origin main
TARGET_COMMIT="$(git rev-parse HEAD)"
TARGET_SHORT="$(git rev-parse --short HEAD)"
info "deploying       : $TARGET_SHORT ($TARGET_COMMIT)"

if [ "$TARGET_COMMIT" = "$CURRENT_COMMIT" ]; then
  info "already up to date; the release will still be rebuilt and verified"
fi

# ================================================== 3. BUILD THE CANDIDATE
log "3. Typecheck, then build the candidate (live .next is not touched)"

# tsc by itself fits on this host. Inside `next build` it is started while
# Turbopack is still resident, which is the step that died in
# outputtracer-build.9K7gao.log. Typecheck first, then tell Next to skip its
# own tsc (see OUTPUTTRACER_DEFER_TYPECHECK in next.config.ts).
info "typecheck       : tsc --noEmit, before the compiler starts"
if ! ./node_modules/.bin/tsc --noEmit --pretty false --incremental false; then
  fail "typecheck failed; the live release is untouched and still serving"
fi
export OUTPUTTRACER_DEFER_TYPECHECK=1

rm -rf "$CANDIDATE_DIR"
export NEXT_DIST_DIR="$CANDIDATE_DIR"
export NEXT_DEPLOYMENT_ID="$TARGET_SHORT"
export NEXT_TELEMETRY_DISABLED=1
# Unset so the running server does not inherit it; the live release must use
# the default distDir.
unset NEXT_DIST_DIR_BUILD

BUILD_LOG="$(mktemp /tmp/outputtracer-build.XXXXXX.log)"
info "build log       : $BUILD_LOG"

if ! npm run build >"$BUILD_LOG" 2>&1; then
  info "---- last 40 lines of the build log ----"
  tail -40 "$BUILD_LOG"
  fail "build failed; the live release is untouched and still serving"
fi
info "build finished"
unset OUTPUTTRACER_DEFER_TYPECHECK
restore_tsconfig

# ================================================= 4. VERIFY THE CANDIDATE
log "4. Verify the candidate build artefacts"

for artefact in BUILD_ID routes-manifest.json prerender-manifest.json \
                 required-server-files.json server static; do
  if [ ! -e "$CANDIDATE_DIR/$artefact" ]; then
    fail "candidate is missing $artefact"
  fi
done
CANDIDATE_BUILD_ID="$(cat "$CANDIDATE_DIR/BUILD_ID")"
info "candidate BUILD_ID: $CANDIDATE_BUILD_ID"
info "candidate release : $TARGET_SHORT"

# The homepage must carry the release id, so the live site can be identified
# later without adding any visible text to it.
if ! grep -rq "data-dpl-id=\"$TARGET_SHORT\"" "$CANDIDATE_DIR/server/app/index.html" 2>/dev/null; then
  fail "candidate homepage does not carry data-dpl-id=\"$TARGET_SHORT\""
fi
info "homepage carries data-dpl-id=\"$TARGET_SHORT\""

# ================================================== 5. SMOKE TEST CANDIDATE
log "5. Smoke test the candidate on port $DEPLOY_PORT (live site keeps serving)"

SMOKE_PID=""
cleanup_smoke() {
  if [ -n "$SMOKE_PID" ] && kill -0 "$SMOKE_PID" 2>/dev/null; then
    kill "$SMOKE_PID" 2>/dev/null || true
    wait "$SMOKE_PID" 2>/dev/null || true
  fi
}
trap cleanup_smoke EXIT

NODE_ENV=production PORT="$DEPLOY_PORT" NEXT_DIST_DIR="$CANDIDATE_DIR" \
  NEXT_DEPLOYMENT_ID="$TARGET_SHORT" \
  node node_modules/tsx/dist/cli.mjs server.ts >/tmp/outputtracer-smoke.log 2>&1 &
SMOKE_PID=$!

info "waiting for the candidate to accept connections..."
READY=0
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:$DEPLOY_PORT/robots.txt"; then
    READY=1
    break
  fi
  if ! kill -0 "$SMOKE_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  info "---- candidate log ----"
  tail -30 /tmp/outputtracer-smoke.log
  fail "candidate did not start; the live release is untouched"
fi

for route in "${PUBLIC_ROUTES[@]}"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "http://127.0.0.1:$DEPLOY_PORT$route")"
  if [ "$code" != "200" ]; then
    fail "candidate returned $code for $route (expected 200); the live release is untouched"
  fi
done
info "all ${#PUBLIC_ROUTES[@]} public routes answered 200"

for route in "${PROTECTED_ROUTES[@]}"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "http://127.0.0.1:$DEPLOY_PORT$route")"
  if [ "$code" != "307" ] && [ "$code" != "308" ]; then
    fail "candidate returned $code for $route (expected a 307 redirect to login)"
  fi
done
info "all ${#PROTECTED_ROUTES[@]} protected routes redirected to login"

if ! curl -s --max-time 30 "http://127.0.0.1:$DEPLOY_PORT/" | grep -q "data-dpl-id=\"$TARGET_SHORT\""; then
  fail "candidate is not serving the expected release id"
fi
info "candidate is serving the expected release"

cleanup_smoke
SMOKE_PID=""

# ==================================================== 6. PROMOTE THE RELEASE
log "6. Promote the candidate to the live release"

rm -rf "$PREV_DIR"
if [ -d .next ]; then
  mv .next "$PREV_DIR"
  info "previous release kept as $PREV_DIR"
fi
mv "$CANDIDATE_DIR" .next
printf '%s\n' "$TARGET_COMMIT" > .next/RELEASE
info "live release is now $TARGET_SHORT"

# The live server must use the default distDir and the release id.
export NEXT_DEPLOYMENT_ID="$TARGET_SHORT"
unset NEXT_DIST_DIR

pm2 stop "$PM2_APP" || true
sleep 1
if ! pm2 restart "$PM2_APP" --update-env; then
  info "---- pm2 logs ----"
  pm2 logs "$PM2_APP" --lines 40 --nostream || true
  rollback_promoted "PM2 could not start the new release"
fi
info "PM2 restarted"

# ================================================== 7. HEALTH CHECK + ROLLBACK
log "7. Health check"

HEALTHY=0
for _ in $(seq 1 45); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE_URL/robots.txt" || echo 000)"
  if [ "$code" = "200" ]; then
    HEALTHY=1
    break
  fi
  sleep 2
done

if [ "$HEALTHY" -ne 1 ]; then
  rollback_promoted "health check failed; rolled back to the previous release"
fi

# The live site must now be serving the new release id.
if ! curl -s --max-time 30 "$BASE_URL/" | grep -q "data-dpl-id=\"$TARGET_SHORT\""; then
  rollback_promoted "the live site is not serving release $TARGET_SHORT; rolled back"
fi
info "live site is serving release $TARGET_SHORT"

for route in "${PUBLIC_ROUTES[@]}"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$BASE_URL$route" || echo 000)"
  if [ "$code" != "200" ]; then
    rollback_promoted "live site returned $code for $route; rolled back"
  fi
done
info "all ${#PUBLIC_ROUTES[@]} public routes answered 200 on the live site"

log "Deployment complete"
info "commit    : $TARGET_COMMIT"
info "BUILD_ID  : $CANDIDATE_BUILD_ID"
info "rollback  : pm2 stop $PM2_APP && rm -rf .next && mv $PREV_DIR .next && pm2 restart $PM2_APP --update-env"
info "logs      : pm2 logs $PM2_APP --lines 50 --nostream"
