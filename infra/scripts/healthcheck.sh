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
HC_START_MS=$(( $(date +%s%N) / 1000000 ))
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

# Is stdout ALREADY this log file? Under cron it is: the crontab entry appends
# stdout to the same path this script writes to, so every line landed twice --
# 160 "health check starting" lines for ~80 runs on 2026-09-09, while
# health_runs held exactly one row per tick. Harmless to read and wrong to
# count, which is the problem: `grep -c FAILED` over this file returns double,
# and the day someone counts failures from the log instead of the table they
# get a number that looks plausible and is not.
#
# Compared by device+inode rather than by path, because the duplication comes
# from a redirect the script cannot see. If stat fails for any reason this
# stays 0 and the old double-write returns -- a log should fail towards saying
# something twice, never towards saying it not at all.
# fd 9 is a copy of the REAL stdout. Do not read /dev/stdout here: command
# substitution replaces fd 1 with its own capture pipe, so `$(stat /dev/stdout)`
# describes the pipe and never matches -- which is exactly how the first version
# of this check silently did nothing while looking correct.
LOG_IS_STDOUT=0
exec 9>&1
if [[ -e "${HEALTH_LOG}" ]]; then
  _out_id="$(stat -Lc '%d:%i' /dev/fd/9 2>/dev/null || true)"
  _log_id="$(stat -Lc '%d:%i' "${HEALTH_LOG}" 2>/dev/null || true)"
  if [[ -n "${_out_id}" && "${_out_id}" == "${_log_id}" ]]; then LOG_IS_STDOUT=1; fi
fi

# Never let an unwritable log turn a health check into a wall of tee errors --
# stdout is what cron captures, and the check itself must still run.
log() {
  local line; line="$(printf '[%s] %s' "$(date -Iseconds)" "$*")"
  printf '%s\n' "${line}"
  if [[ "${LOG_IS_STDOUT}" -eq 0 ]]; then
    printf '%s\n' "${line}" >> "${HEALTH_LOG}" 2>/dev/null || true
  fi
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

# --- 5. mail authentication has not silently duplicated --------------------
# GoDaddy published a second SPF record (an `_spfm.` wrapper) and a second
# DMARC record (`p=quarantine`, reporting to @onsecureserver.net). Support
# called it a system bug, not a feature, and said it will not regenerate. This
# check is here because "it will not come back" is a claim, not a control:
# duplicate SPF is a PermError, and duplicate DMARC makes the policy
# unevaluable, and neither announces itself.
#
# QUERIED AUTHORITATIVELY, on purpose. A `dig` from this box reads the local
# stub resolver's cache: minutes after the records were fixed, this server
# still returned both pairs with 550s of TTL left while the authoritative
# servers and 1.1.1.1 both showed the corrected single records. A cached answer
# is not a fact about DNS, and a check that alarms on stale cache is worse than
# no check.
MAIL_DOMAIN="${MAIL_DOMAIN:-ryvodigital.com}"
dns_txt() {   # dns_txt <name> -- overridable so the parsing can be unit-tested
  if [[ -n "${DNS_FIXTURE:-}" ]]; then printf '%s\n' "${DNS_FIXTURE}"; return; fi
  local ns; ns="$(dig +short NS "${MAIL_DOMAIN}" | head -1)"
  [[ -z "${ns}" ]] && return 1
  dig +norecurse +short TXT "$1" "@${ns}" 2>/dev/null
}
if command -v dig >/dev/null 2>&1; then
  SPF_TXT="$(dns_txt "${MAIL_DOMAIN}")"; SPF_RC=$?
  DMARC_TXT="$(dns_txt "_dmarc.${MAIL_DOMAIN}")"; DMARC_RC=$?
  if (( SPF_RC != 0 || DMARC_RC != 0 )); then
    log "  skip  mail DNS: no authoritative answer (not treated as a failure)"
  else
    SPF_N="$(printf '%s\n' "${SPF_TXT}" | grep -c 'v=spf1')"
    DMARC_N="$(printf '%s\n' "${DMARC_TXT}" | grep -c 'v=DMARC1')"
    if (( SPF_N == 1 )); then pass "one SPF record on ${MAIL_DOMAIN}"
    else fail "${SPF_N} SPF records on ${MAIL_DOMAIN} - more than one is a PermError (RFC 7208)"; fi
    if (( DMARC_N == 1 )); then
      POL="$(printf '%s\n' "${DMARC_TXT}" | grep -o 'p=[a-z]*' | head -1)"
      pass "one DMARC record on ${MAIL_DOMAIN} (${POL})"
    else
      fail "${DMARC_N} DMARC records on ${MAIL_DOMAIN} - multiple records mean NO policy is applied (RFC 7489)"
    fi
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

# --- 6. yesterday's metrics were derived ------------------------------------
# A derivation that stops running is silent by construction: the table simply
# stops gaining rows, and nothing else in the system notices or cares. This is
# the cheapest possible check that it is still happening.
if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  YDAY="$(date -d 'yesterday' +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d)"
  MROWS="$(curl -sS --max-time 20 \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      "${SUPABASE_URL%/}/rest/v1/metrics_daily?select=date&date=eq.${YDAY}" 2>/dev/null \
      | grep -o '"date"' | wc -l)"
  if [[ "${MROWS}" -ge 1 ]]; then
    pass "metrics_daily has a row for ${YDAY}"
  else
    fail "metrics_daily has NO row for ${YDAY} - the nightly derivation did not run"
  fi
fi

# --- 7. no run has failed recently -----------------------------------------
# The catch-all, and the one that covers dependencies this script knows nothing
# about. D5 drill 1 broke the Anthropic credential: every lead escalated
# correctly and got its handoff note, and NOTHING raised an alert by email --
# the only signal was a WhatsApp push riding the sandbox that expires every 72
# hours. Any dependency failure that produces an error run is now an email
# within ten minutes, independent of Twilio.
if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  SINCE="$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
           || date -u -v-30M +%Y-%m-%dT%H:%M:%SZ)"
  # The deploy gate (CLAUDE.md) runs the Concierge 20 times against a build that is
  # NOT live, under its own rehearsal client. Its runs must never page anybody: a
  # failing gate is reported by the gate, to the person running it. Only that ONE
  # client automation is excluded. The Ryvo Test Client is rehearsal too, and its
  # errors MUST still alert: that is how the live sabotage checks prove the alert.
  GATE_FILTER=""
  [[ -n "${GATE_CLIENT_AUTOMATION_ID:-}" ]] && GATE_FILTER="&client_automation_id=neq.${GATE_CLIENT_AUTOMATION_ID}"
  ERRS="$(curl -sS --max-time 20 \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      "${SUPABASE_URL%/}/rest/v1/automation_runs?select=error_type&status=eq.error&created_at=gte.${SINCE}${GATE_FILTER}" \
      2>/dev/null)"
  NERR="$(printf '%s' "${ERRS}" | grep -o '"error_type"' | wc -l)"
  if [[ "${NERR}" -eq 0 ]]; then
    pass "no failed automation runs in the last 30 minutes"
  else
    WHAT="$(printf '%s' "${ERRS}" | grep -oE '"error_type":"[^"]*"' | sort -u | head -3 | tr '\n' ' ')"
    fail "${NERR} failed automation run(s) in the last 30 minutes: ${WHAT}"
  fi
fi

# --- the n8n API key (21 Sep 2026) ------------------------------------------
# Deploys go through n8n's public API with N8N_API_KEY (infra/scripts/
# n8n_api_deploy.py). A lapsed key blocks every deploy, and nothing else would
# say so until the day a fix is needed. Its expiry is its own JWT exp claim, read
# here without the key ever leaving this process: python reads it from the
# environment, never from argv. It fails at <= N8N_KEY_WARN_DAYS so the ordinary
# alert email goes out a week ahead.
N8N_KEY_WARN_DAYS="${N8N_KEY_WARN_DAYS:-7}"
N8N_API_KEY_EXP=""
if [[ -z "${N8N_API_KEY:-}" ]]; then
  fail "n8n API key missing from .env - deploys cannot run"
else
  N8N_API_KEY_EXP="$(python3 -c 'import os, json, base64
p = os.environ["N8N_API_KEY"].split(".")[1]
print(int(json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4)))["exp"]))' 2>/dev/null)"
  if [[ ! "${N8N_API_KEY_EXP}" =~ ^[0-9]+$ ]]; then
    N8N_API_KEY_EXP=""
    fail "n8n API key has no readable expiry - check it is the whole key"
  else
    KEY_DAYS=$(( (N8N_API_KEY_EXP - $(date +%s)) / 86400 ))
    KEY_DATE="$(date -u -d "@${N8N_API_KEY_EXP}" +%Y-%m-%d)"
    if (( KEY_DAYS <= N8N_KEY_WARN_DAYS )); then
      fail "n8n API key expires ${KEY_DATE} (${KEY_DAYS} days) - deploys stop when it lapses; create a new one in n8n (Settings, n8n API)"
    else
      pass "n8n API key expires ${KEY_DATE} (${KEY_DAYS} days left)"
    fi
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

# ---------------------------------------------------------------- publish
#
# Make the result readable by the cockpit (§5.6). This runs on BOTH paths --
# before the all-passed branch below, which exits 0 early -- because a health
# screen that only updates on failure is a health screen that looks broken
# whenever things are fine.
#
# It must never be able to break the check. A monitoring script that dies
# because its own telemetry POST failed is worse than one that never published:
# every failure here is swallowed and logged, and the health check's exit code
# is untouched. Rule 4 in reverse -- the thing that watches must not acquire a
# new dependency that can take it down.
#
# When Supabase is the thing that is broken, this POST fails and the screen
# simply stops updating. That is the designed behaviour: staleness is the
# signal, and email remains the channel that does not depend on what it
# watches.
publish_health() {
  # HC_PUBLISH=0: a test run (a forced failure) must not reach the cockpit's screen.
  [[ "${HC_PUBLISH:-1}" == "1" ]] || { log "  publish skipped - HC_PUBLISH=0"; return 0; }
  [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] || {
    log "  publish skipped - no Supabase credentials in the environment"
    return 0
  }

  local payload
  # Built by python3 rather than by string-pasting: a check name contains
  # quotes, em-dashes and parentheses ("webhook returned HTTP 404 to an
  # unsigned POST, expected 403"), and hand-rolled JSON would break on the
  # first one and publish nothing.
  payload="$(
    HC_OK="$1" HC_MS="$2" HC_HOST="$(hostname)" HC_KEY_EXP="${N8N_API_KEY_EXP:-}" \
    python3 - "${PASSED[@]:-}" --failed-- "${FAILURES[@]:-}" <<'PYEOF'
import json, os, sys
args = sys.argv[1:]
cut = args.index('--failed--') if '--failed--' in args else len(args)
passed = [a for a in args[:cut] if a]
failed = [a for a in args[cut + 1:] if a]
print(json.dumps({
    "ran_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "ok": os.environ["HC_OK"] == "1",
    "passed": passed,
    "failed": failed,
    "duration_ms": int(os.environ["HC_MS"]),
    "host": os.environ["HC_HOST"],
    **({"n8n_api_key_exp": __import__("datetime").datetime.fromtimestamp(int(os.environ["HC_KEY_EXP"]), __import__("datetime").timezone.utc).isoformat()}
       if os.environ.get("HC_KEY_EXP") else {}),
}))
PYEOF
  )" || { log "  publish skipped - could not build the payload"; return 0; }

  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    -X POST "${SUPABASE_URL%/}/rest/v1/health_runs" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "content-type: application/json" \
    -H "Prefer: return=minimal" \
    -d "${payload}" 2>/dev/null)" || code="000"

  # n8n_api_key_exp needs migration 0051. Until it is applied, PostgREST rejects the
  # unknown column (400) -- so retry once without it rather than publish nothing.
  if [[ ! "${code}" =~ ^2 && "${payload}" == *n8n_api_key_exp* ]]; then
    log "  publish with n8n_api_key_exp got HTTP ${code} - retrying without it (is migration 0051 applied?)"
    payload="$(printf '%s' "${payload}" | python3 -c 'import json, sys; d = json.load(sys.stdin); d.pop("n8n_api_key_exp", None); print(json.dumps(d))')"
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
      -X POST "${SUPABASE_URL%/}/rest/v1/health_runs" \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "content-type: application/json" \
      -H "Prefer: return=minimal" \
      -d "${payload}" 2>/dev/null)" || code="000"
  fi

  # The status is READ, not assumed. A 401 or a 42501 permission error returns
  # a perfectly ordinary-looking curl exit 0 -- the whole point of #6.
  if [[ "${code}" =~ ^2 ]]; then
    log "  published to health_runs (HTTP ${code})"
  else
    log "  publish FAILED (HTTP ${code}) - the cockpit's health screen will go stale"
  fi

  # Every 10 minutes is 144 rows a day. Keep a fortnight; best effort.
  curl -s -o /dev/null --max-time 10 \
    -X DELETE "${SUPABASE_URL%/}/rest/v1/health_runs?ran_at=lt.$(date -u -d '14 days ago' +%Y-%m-%dT%H:%M:%SZ)" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" >/dev/null 2>&1 || true
}

if (( ${#FAILURES[@]} == 0 )); then
  publish_health 1 "$(( $(date +%s%N) / 1000000 - HC_START_MS ))" || true
else
  publish_health 0 "$(( $(date +%s%N) / 1000000 - HC_START_MS ))" || true
fi

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
