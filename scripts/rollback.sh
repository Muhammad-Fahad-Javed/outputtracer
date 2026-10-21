#!/usr/bin/env bash
#
# Roll the live release back to the previous build.
#
# The deploy script keeps the release that was live before the last promotion
# in .next.prev, so a rollback is a rename plus a restart. No git history is
# touched and no file is deleted.
#
# Usage:
#   scripts/rollback.sh
#
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ec2-user/outputtracer}"
PM2_APP="${PM2_APP:-outputtracer}"
PREV_DIR=".next.prev"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\n!!! %s\n' "$*" >&2; exit 1; }

cd "$APP_DIR"

[ -d "$PREV_DIR" ] || fail "$PREV_DIR does not exist; there is no previous release to roll back to"

log "Current release"
if [ -f .next/RELEASE ]; then
  printf '    commit    : %s\n' "$(cat .next/RELEASE)"
fi
if [ -f .next/BUILD_ID ]; then
  printf '    BUILD_ID  : %s\n' "$(cat .next/BUILD_ID)"
fi

log "Previous release"
if [ -f "$PREV_DIR/RELEASE" ]; then
  printf '    commit    : %s\n' "$(cat "$PREV_DIR/RELEASE")"
fi
if [ -f "$PREV_DIR/BUILD_ID" ]; then
  printf '    BUILD_ID  : %s\n' "$(cat "$PREV_DIR/BUILD_ID")"
fi

log "Swapping the live release back"
FAILED_DIR=".next.failed.$(date +%Y%m%d%H%M%S)"
mv .next "$FAILED_DIR"
mv "$PREV_DIR" .next
printf '    the release that was live is kept in %s\n' "$FAILED_DIR"

log "Restarting PM2"
# NEXT_DIST_DIR must not be set: the live release always uses the default.
unset NEXT_DIST_DIR
pm2 stop "$PM2_APP" || true
sleep 1
pm2 restart "$PM2_APP" --update-env

log "Health check"
HEALTHY=0
for _ in $(seq 1 45); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${BASE_URL:-https://outputtracer.com}/robots.txt" || echo 000)"
  if [ "$code" = "200" ]; then HEALTHY=1; break; fi
  sleep 2
done

if [ "$HEALTHY" -ne 1 ]; then
  fail "the rolled back release is not answering; check: pm2 logs $PM2_APP --lines 50 --nostream"
fi

log "Rollback complete"
printf '    the previous release is live again\n'
printf '    to retry the failed deployment: scripts/deploy-production.sh\n'
