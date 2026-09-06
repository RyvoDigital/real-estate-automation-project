#!/usr/bin/env bash
#
# §11 item 2: the service_role key must never reach the browser, "verified by
# inspecting the served bundle, not by reading the code".
#
# So this builds, serves, and searches what the browser is actually given:
# every JS/CSS asset under .next/static, plus the HTML of every reachable
# page — the HTML matters because the realistic leak is not an inlined env
# var (Next only inlines NEXT_PUBLIC_*), it is a server component handing a
# secret to a client component as a prop, which serialises into the RSC
# payload inside the page.
#
# The check carries its own POSITIVE CONTROL. A grep that finds nothing and
# a grep that cannot find anything look identical, and this project has been
# bitten by that four times (engineering-lessons.md §1, #4 and rule 6). So
# the script first plants a deliberate leak, proves it is caught, removes it,
# and only then reports a clean result. Without the control this script would
# print PASS against an empty search and mean nothing.
#
# Usage:  bash tests/no-secret-in-bundle.sh
# Needs:  .env.local with SUPABASE_SERVICE_ROLE_KEY set (any value; a
#         throwaway sentinel is safer than the real key and works identically)

set -uo pipefail
cd "$(dirname "$0")/.."

PORT=${PORT:-3123}
FAIL=0

need_secret() {
  # shellcheck disable=SC1091
  SECRET=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env.local 2>/dev/null | cut -d= -f2-)
  if [ -z "${SECRET:-}" ]; then
    echo "FATAL: SUPABASE_SERVICE_ROLE_KEY not found in .env.local."
    echo "       Refusing to report a pass against a search for an empty string."
    exit 2
  fi
}

start_server() {
  pkill -f "next-server" >/dev/null 2>&1
  lsof -ti:"$PORT" 2>/dev/null | xargs -r kill -9 >/dev/null 2>&1
  sleep 1
  (PORT=$PORT npm start >/tmp/cockpit-bundle-check.log 2>&1 &)
  for _ in $(seq 1 45); do
    sleep 1
    curl -s -o /dev/null "http://localhost:$PORT/login" && return 0
  done
  echo "FATAL: server did not come up on :$PORT"
  cat /tmp/cockpit-bundle-check.log | tail -20
  exit 2
}

stop_server() {
  pkill -f "next-server" >/dev/null 2>&1
  lsof -ti:"$PORT" 2>/dev/null | xargs -r kill -9 >/dev/null 2>&1
}

collect() {
  # Everything the browser can be handed, into one file.
  : >/tmp/cockpit-served.txt
  find .next/static -type f \( -name '*.js' -o -name '*.css' \) -exec cat {} + \
    >>/tmp/cockpit-served.txt 2>/dev/null
  for path in / /login /queue "/leads/00000000-0000-0000-0000-000000000000" "$@"; do
    curl -s -L "http://localhost:$PORT$path" >>/tmp/cockpit-served.txt
  done
  wc -c </tmp/cockpit-served.txt | tr -d ' '
}

need_secret

echo "== 1. negative control: plant a leak and prove the check catches it =="
mkdir -p src/app/auth/leaktest
cat >src/app/auth/leaktest/Client.tsx <<'TSX'
'use client'
export default function Client({ secret }: { secret: string }) {
  return <div data-x={secret}>{secret}</div>
}
TSX
cat >src/app/auth/leaktest/page.tsx <<'TSX'
import Client from './Client'
export const dynamic = 'force-dynamic'
export default function Page() {
  return <Client secret={process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'unset'} />
}
TSX

npm run build >/tmp/cockpit-leakbuild.log 2>&1 || { echo "FATAL: leak build failed"; tail -20 /tmp/cockpit-leakbuild.log; exit 2; }
start_server
BYTES=$(collect /auth/leaktest)
HITS=$(grep -c -- "$SECRET" /tmp/cockpit-served.txt)
stop_server
rm -rf src/app/auth/leaktest

if [ "$HITS" -gt 0 ]; then
  echo "   PASS — planted leak found ($HITS hit(s) in ${BYTES} bytes). The check works."
else
  echo "   FAIL — the check could NOT see a deliberate leak. Everything below is meaningless."
  exit 2
fi

echo
echo "== 2. the real build =="
npm run build >/tmp/cockpit-cleanbuild.log 2>&1 || { echo "FATAL: build failed"; tail -20 /tmp/cockpit-cleanbuild.log; exit 2; }
start_server
BYTES=$(collect)
HITS=$(grep -c -- "$SECRET" /tmp/cockpit-served.txt)
CLIENT_COMPONENTS=$(grep -rl "^'use client'" src/ 2>/dev/null | wc -l | tr -d ' ')
stop_server

echo "   bytes searched:            ${BYTES}"
echo "   service_role occurrences:  ${HITS}"
echo "   'use client' components:   ${CLIENT_COMPONENTS}"

if [ "$HITS" -ne 0 ]; then
  echo "   FAIL — the service_role key is reachable from the browser."
  FAIL=1
else
  echo "   PASS — no occurrence in anything served."
fi

exit $FAIL
