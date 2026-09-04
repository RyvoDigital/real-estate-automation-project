#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Ryvo health check — Checkpoint D1.
#
# Runs from cron ON THE BOX, deliberately OUTSIDE n8n. A check that needs n8n
# to be healthy in order to report that n8n is unhealthy tells you nothing on
# the day it matters. Same reasoning that moved alerting off the Twilio
# sandbox: the watcher must not share a fate with the watched.
#
# The two workflow checks exist because of a real, unexplained outage on
# 2026-09-04: the webhook began returning 404 with "Active version not found",
# with no deployment in the window, and the only thing that noticed was a test
# failing some hours later. Either check below would have caught it in minutes.
#
# Exit codes: 0 all checks passed. 1 one or more checks failed.
#             2 checks failed AND the alert could not be sent.
# ---------------------------------------------------------------------------
set -uo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/ryvo-automation-platform}"
STATE_DIR="${STATE_DIR:-/var/lib/ryvo}"
STATE_FILE="${STATE_DIR}/health.state"
HEALTH_LOG="${HEALTH_LOG:-/var/log/ryvo-health.log}"
RENOTIFY_HOURS="${RENOTIFY_HOURS:-6}"
WEBHOOK_URL="${WEBHOOK_URL:-https://n8n.ryvodigital.com/webhook/twilio-inbound}"
BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/backups}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-30}"
N8N_CONTAINER="${N8N_CONTAINER:-infra-n8n-1}"
PG_CONTAINER="${PG_CONTAINER:-infra-postgres-1}"

# shellcheck source=/dev/null
[[ -f "${REPO_ROOT}/.env" ]] && set -a && . "${REPO_ROOT}/.env" && set +a
# shellcheck source=/dev/null
. "$(dirname "$0")/alert.sh"

mkdir -p "${STATE_DIR}" 2>/dev/null || true
# Never let an unwritable log turn a health check into a wall of tee errors --
# stdout is what cron captures, and the check itself must still run.
log() {
  local line; line="$(printf '[%s] %s' "$(date -Iseconds)" "$*")"
  printf '%s\n' "${line}"
  printf '%s\n' "${line}" >> "${HEALTH_LOG}" 2>/dev/null || true
}

FAILURES=()
pass() { log "  PASS  $1"; }
fail() { log "  FAIL  $1"; FAILURES+=("$1"); }

log "health check starting"

# --- 1. containers ---------------------------------------------------------
for c in "${N8N_CONTAINER}" "${PG_CONTAINER}" infra-caddy-1; do
  if [[ "$(docker inspect -f '{{.State.Running}}' "${c}" 2>/dev/null)" == "true" ]]; then
    pass "container ${c} is running"
  else
    fail "container ${c} is NOT running"
  fi
done

# --- 2. every active workflow has a published version ----------------------
# `active=true` is not enough. n8n serves a workflow from activeVersionId; when
# that is NULL the webhook 404s with "Active version not found" while the
# workflow still looks active in every other place you would think to check.
UNPUB="$(docker exec "${PG_CONTAINER}" psql -U n8n -d n8n -tAc \
  "select id from workflow_entity where active = true and \"activeVersionId\" is null" 2>/dev/null)"
if [[ -z "${UNPUB}" ]]; then
  pass "every active workflow has activeVersionId set"
else
  fail "active workflow(s) with NO published version: $(echo "${UNPUB}" | tr '\n' ' ')"
fi

# --- 3. the webhook actually answers ---------------------------------------
# An unsigned POST must be REJECTED by the signature check, which means the
# workflow ran. 403 is therefore proof of life; 404 is the failure above
# reaching the outside world; anything else is its own problem.
CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 \
        -X POST "${WEBHOOK_URL}" -d 'Body=healthcheck' 2>/dev/null)" || CODE="000"
if [[ "${CODE}" == "403" ]]; then
  pass "webhook rejects an unsigned POST with 403 (signature check ran)"
else
  fail "webhook returned HTTP ${CODE} to an unsigned POST, expected 403"
fi

# --- 4. the backup is recent and the last run succeeded --------------------
NEWEST="$(find "${BACKUP_DIR}" -name 'n8n-*.sql.gz' -type f -printf '%T@ %p\n' 2>/dev/null \
          | sort -rn | head -1)"
if [[ -z "${NEWEST}" ]]; then
  fail "no database dump found in ${BACKUP_DIR}"
else
  AGE_H=$(( ( $(date +%s) - ${NEWEST%%.*} ) / 3600 ))
  if (( AGE_H <= BACKUP_MAX_AGE_HOURS )); then
    pass "newest dump is ${AGE_H}h old ($(basename "${NEWEST#* }"))"
  else
    fail "newest dump is ${AGE_H}h old, expected under ${BACKUP_MAX_AGE_HOURS}h"
  fi
fi
if [[ -f "${STATE_DIR}/backup.status" ]]; then
  BSTATUS="$(cat "${STATE_DIR}/backup.status")"
  if [[ "${BSTATUS}" == "ok" ]]; then
    pass "last backup run exited 0"
  else
    fail "last backup run FAILED (${BSTATUS})"
  fi
fi

# --- 5. Supabase is awake --------------------------------------------------
# Checked, never depended on. The free tier auto-pauses after ~a week of
# inactivity and the DNS record disappears, which is exactly the failure the
# keepalive exists to prevent and the one that made the old alarm silent.
if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  SB="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 \
        -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
        "${SUPABASE_URL%/}/rest/v1/clients?select=id&limit=1" 2>/dev/null)" || SB="000"
  if [[ "${SB}" =~ ^2 ]]; then
    pass "Supabase reachable (HTTP ${SB})"
  else
    fail "Supabase returned HTTP ${SB} — paused, unreachable, or key rejected"
  fi
fi

# --- verdict ---------------------------------------------------------------
NOW=$(date +%s)
PREV_STATE="none"; PREV_AT=0
[[ -f "${STATE_FILE}" ]] && read -r PREV_STATE PREV_AT < "${STATE_FILE}" 2>/dev/null || true

if (( ${#FAILURES[@]} == 0 )); then
  log "all checks passed"
  if [[ "${PREV_STATE}" == "failing" ]]; then
    ryvo_alert "Ryvo: recovered" \
      "All health checks are passing again as of $(date -Iseconds)."
  fi
  printf 'healthy %s\n' "${NOW}" > "${STATE_FILE}"
  exit 0
fi

BODY="$(printf 'Ryvo health check failed at %s\n\n' "$(date -Iseconds)")"
for f in "${FAILURES[@]}"; do BODY+="  - ${f}"$'\n'; done
BODY+=$'\n'"Host: $(hostname)"$'\n'"Log: ${HEALTH_LOG}"
log "FAILED: ${#FAILURES[@]} check(s)"

# Alert on the transition into failure, then at most every RENOTIFY_HOURS while
# it stays broken. Silence between re-notifications is deliberate; an alert
# channel that repeats every five minutes gets filtered, and a filtered alert
# is the same as no alert.
SHOULD_ALERT=0
if [[ "${PREV_STATE}" != "failing" ]]; then
  SHOULD_ALERT=1
elif (( NOW - PREV_AT >= RENOTIFY_HOURS * 3600 )); then
  SHOULD_ALERT=1
fi

RC=1
if (( SHOULD_ALERT )); then
  if ryvo_alert "Ryvo: ${#FAILURES[@]} health check(s) failing" "${BODY}"; then
    printf 'failing %s\n' "${NOW}" > "${STATE_FILE}"
  else
    # Do NOT record the notification time: nobody was told, so the next run
    # must try again rather than sitting in the re-notify window.
    printf 'failing %s\n' "${PREV_AT}" > "${STATE_FILE}"
    RC=2
  fi
else
  printf 'failing %s\n' "${PREV_AT}" > "${STATE_FILE}"
fi
exit "${RC}"
