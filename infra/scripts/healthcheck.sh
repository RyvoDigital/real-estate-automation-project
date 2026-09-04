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
PASSED=()
pass() { log "  PASS  $1"; PASSED+=("$1"); }
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
        -X POST "${WEBHOOK_URL}" \
        -d 'Body=ryvo-healthcheck&RyvoHealthcheck=1' 2>/dev/null)" || CODE="000"
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
# State: "<state> <since_epoch> <consecutive_fails> <notified 0|1>"
#
# Three things were wrong with the first version, and all three pushed mail
# towards a spam folder:
#
#   1. It alerted on the FIRST failing run, so every maintenance restart
#      produced a failure and then a recovery. Four "Ryvo: recovered" mails
#      went out in one afternoon, byte-identical apart from a timestamp -- a
#      textbook bulk signal, and they were the ones that landed in spam while
#      the varied failure subjects did not.
#   2. It sent "recovered" even when the failure had never been announced, so
#      the first thing the recipient saw was the end of a problem they were
#      never told about.
#   3. Every subject line was identical. Subjects now name what is actually
#      broken, so consecutive alerts differ from each other.
#
# An alert in a spam folder is not an alert. Volume and sameness are part of
# deliverability, not cosmetics.
NOW=$(date +%s)
FAIL_THRESHOLD="${FAIL_THRESHOLD:-2}"      # ~20 min at a 10-minute cadence
PREV_STATE="none"; PREV_AT=0; PREV_N=0; PREV_NOTIFIED=0
if [[ -f "${STATE_FILE}" ]]; then
  read -r PREV_STATE PREV_AT PREV_N PREV_NOTIFIED < "${STATE_FILE}" 2>/dev/null || true
  PREV_AT="${PREV_AT:-0}"; PREV_N="${PREV_N:-0}"; PREV_NOTIFIED="${PREV_NOTIFIED:-0}"
fi

human_duration() {
  local secs=$1
  if (( secs < 3600 )); then printf '%dm' $(( secs / 60 ))
  else printf '%dh%02dm' $(( secs / 3600 )) $(( (secs % 3600) / 60 )); fi
}

if (( ${#FAILURES[@]} == 0 )); then
  log "all checks passed"
  # Only announce a recovery for a problem that was actually announced.
  if [[ "${PREV_STATE}" == "failing" && "${PREV_NOTIFIED}" == "1" ]]; then
    DOWN="$(human_duration $(( NOW - PREV_AT )))"
    ryvo_alert "Ryvo: recovered after ${DOWN} — all ${#PASSED[@]} checks passing" \
      "$(printf 'Recovered at %s after %s.\n\nAll checks passing:\n%s\n\nHost: %s' \
         "$(date -Iseconds)" "${DOWN}" \
         "$(printf '  - %s\n' "${PASSED[@]}")" "$(hostname)")"
  elif [[ "${PREV_STATE}" == "failing" ]]; then
    log "recovered from a transient failure that was never alerted - staying quiet"
  fi
  printf 'healthy %s 0 0\n' "${NOW}" > "${STATE_FILE}"
  exit 0
fi

# String comparison stays OUT of arithmetic context: $(( PREV_STATE == "failing" ))
# treats PREV_STATE as a variable NAME to dereference, and under `set -u` that
# aborts the whole check with "healthy: unbound variable".
if [[ "${PREV_STATE}" == "failing" ]]; then
  CONSEC=$(( PREV_N + 1 )); SINCE="${PREV_AT}"
else
  CONSEC=1; SINCE="${NOW}"
fi

# A subject that names the fault, so two consecutive alerts are not identical.
SUBJ_DETAIL="${FAILURES[0]%% —*}"
SUBJ_DETAIL="${SUBJ_DETAIL:0:70}"
if (( ${#FAILURES[@]} > 1 )); then
  SUBJECT="Ryvo: ${SUBJ_DETAIL} (+$(( ${#FAILURES[@]} - 1 )) more)"
else
  SUBJECT="Ryvo: ${SUBJ_DETAIL}"
fi

BODY="$(printf 'Ryvo health check FAILED at %s (failing for %s, %d consecutive run(s)).\n\n' \
        "$(date -Iseconds)" "$(human_duration $(( NOW - SINCE )))" "${CONSEC}")"
for f in "${FAILURES[@]}"; do BODY+="  FAIL  ${f}"$'\n'; done
if (( ${#PASSED[@]} > 0 )); then
  BODY+=$'\n'"Still passing:"$'\n'
  for pchk in "${PASSED[@]}"; do BODY+="  ok    ${pchk}"$'\n'; done
fi
BODY+=$'\n'"Host: $(hostname)"$'\n'"Log: ${HEALTH_LOG}"
log "FAILED: ${#FAILURES[@]} check(s), consecutive=${CONSEC}"

# One transient failing run is usually a restart, not an outage. Waiting for
# FAIL_THRESHOLD consecutive runs removes almost all of the noise -- and the
# noise was the deliverability problem.
SHOULD_ALERT=0
if (( CONSEC >= FAIL_THRESHOLD )); then
  if [[ "${PREV_NOTIFIED}" != "1" ]]; then
    SHOULD_ALERT=1
  elif (( NOW - PREV_AT >= RENOTIFY_HOURS * 3600 )); then
    SHOULD_ALERT=1
  fi
else
  log "below the alert threshold (${CONSEC}/${FAIL_THRESHOLD}) - not alerting yet"
fi

RC=1
NOTIFIED="${PREV_NOTIFIED}"
if (( SHOULD_ALERT )); then
  if ryvo_alert "${SUBJECT}" "${BODY}"; then
    NOTIFIED=1
  else
    # Nobody was told, so do not record a notification: the next run must try
    # again rather than sitting out the re-notify window.
    NOTIFIED=0
    RC=2
  fi
fi
printf 'failing %s %s %s\n' "${SINCE}" "${CONSEC}" "${NOTIFIED}" > "${STATE_FILE}"
exit "${RC}"
