#!/usr/bin/env bash
#
# Verify the live OutputTracer release.
#
# Checks the public site over HTTPS: the routes that must exist, the routes
# that must redirect an anonymous visitor to the login page, the canonical
# domain, and the release id that identifies which build is live.
#
# The release id is the Next.js deployment id, rendered as the data-dpl-id
# attribute on <html>. It is machine readable and adds no visible text to the
# page.
#
# Usage:
#   scripts/verify-release.sh                 # verify the live site
#   scripts/verify-release.sh https://host    # verify another origin
#
set -uo pipefail

BASE_URL="${1:-${BASE_URL:-https://outputtracer.com}}"
PM2_APP="${PM2_APP:-outputtracer}"

PUBLIC_ROUTES=(
  / /login /signup /practice /learn /classroom /assembly /python /examples
  /robots.txt /sitemap.xml /login/learner /login/teacher /login/admin
  /classroom/student
)
PROTECTED_ROUTES=( /projects /groups /admin /learn/dashboard /classroom/teacher )

FAILED=0
printf 'Verifying %s\n\n' "$BASE_URL"

printf '%-26s %-6s %s\n' "ROUTE" "CODE" "EXPECTED"
printf '%-26s %-6s %s\n' "-----" "----" "--------"
for route in "${PUBLIC_ROUTES[@]}"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$BASE_URL$route" || echo 000)"
  status="ok"
  if [ "$code" != "200" ]; then status="FAIL"; FAILED=1; fi
  printf '%-26s %-6s %s\n' "$route" "$code" "$status (200)"
done
for route in "${PROTECTED_ROUTES[@]}"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$BASE_URL$route" || echo 000)"
  location="$(curl -sI --max-time 30 "$BASE_URL$route" | tr -d '\r' | awk 'tolower($1)=="location:" {print $2}')"
  status="ok"
  if [ "$code" != "307" ] && [ "$code" != "308" ]; then status="FAIL"; FAILED=1; fi
  case "$location" in
    *devs.surf*) status="FAIL (staging host)"; FAILED=1 ;;
    *"$BASE_URL"*) : ;;
    "") : ;;
    *) status="FAIL (off-site redirect)"; FAILED=1 ;;
  esac
  printf '%-26s %-6s %s\n' "$route" "$code" "$status (307 -> $location)"
done

printf '\n'
printf 'release id (data-dpl-id) : %s\n' \
  "$(curl -s --max-time 30 "$BASE_URL/" | grep -o 'data-dpl-id="[^"]*"' | head -1)"
printf 'canonical (homepage)     : %s\n' \
  "$(curl -s --max-time 30 "$BASE_URL/" | grep -o '<link rel="canonical" href="[^"]*"' | head -1)"

printf '\nwww redirect             : %s\n' \
  "$(curl -sI --max-time 30 "https://www.outputtracer.com/" | tr -d '\r' | awk 'tolower($1)=="location:" {print $2}' | head -1)"

if command -v pm2 >/dev/null 2>&1; then
  printf '\nPM2 status:\n'
  pm2 list 2>/dev/null | grep -E "name|outputtracer" || true
  printf 'recent errors:\n'
  pm2 logs "$PM2_APP" --err --lines 15 --nostream 2>/dev/null | tail -15 || true
fi

if [ "$FAILED" -ne 0 ]; then
  printf '\nRESULT: FAILED\n'
  exit 1
fi
printf '\nRESULT: OK\n'
