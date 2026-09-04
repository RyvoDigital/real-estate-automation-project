#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Ryvo alerting — one place that knows how to reach a human.
#
# Sourced by healthcheck.sh and backup.sh so there is a single implementation
# to get right, and a single place to add a second transport later.
#
# WHY EMAIL, AND WHY NOT THROUGH THE STACK
# The original alarm pushed over WhatsApp via the Twilio *sandbox*, whose
# session expires every 72 hours. An alert channel that dies on a timer, while
# the thing it watches keeps running, is not an alert channel. Worse, the
# escalation path and the alarm shared that transport: one Twilio problem took
# out both the product and the ability to say so.
#
# So this path must not depend on:
#   - Twilio          (the escalation transport it has to be able to report on)
#   - Supabase        (the database it has to be able to report on)
#   - n8n             (the workflow engine it has to be able to report on)
# It is a plain HTTPS call from cron, on the box, with its own credential.
#
# It DOES depend on the mail provider and on outbound network. That is an
# accepted single point of failure for now, and the reason `ryvo_alert` always
# writes to the log before it tries to send: if the send fails, the record of
# what happened still exists locally.
# ---------------------------------------------------------------------------
set -uo pipefail

ALERT_LOG="${ALERT_LOG:-/var/log/ryvo-alerts.log}"

_alert_log() {
  local line; line="$(printf '[%s] %s' "$(date -Iseconds)" "$*")"
  printf '%s\n' "${line}"
  printf '%s\n' "${line}" >> "${ALERT_LOG}" 2>/dev/null || true
}

# ryvo_alert <subject> <body>
# Returns 0 if the alert was delivered, 1 if it could not be sent. Callers
# must treat a non-zero return as "nobody has been told", not as a detail.
ryvo_alert() {
  local subject="$1" body="$2"

  # Log FIRST, unconditionally. A send that fails must not also lose the
  # evidence of what it was trying to report.
  _alert_log "ALERT: ${subject}"
  _alert_log "       ${body//$'\n'/$'\n'       }"

  local to="${ALERT_EMAIL_TO:-}"
  local from="${ALERT_EMAIL_FROM:-}"
  local key="${RESEND_API_KEY:-}"

  if [[ -z "${to}" || -z "${from}" || -z "${key}" ]]; then
    _alert_log "NOT SENT: alerting is not configured (need ALERT_EMAIL_TO," \
               "ALERT_EMAIL_FROM and RESEND_API_KEY in .env)."
    return 1
  fi

  local payload http
  payload=$(TO="${to}" FROM="${from}" SUBJ="${subject}" BODY="${body}" python3 -c '
import json, os
print(json.dumps({"from": os.environ["FROM"], "to": [os.environ["TO"]],
                  "subject": os.environ["SUBJ"], "text": os.environ["BODY"]}))')

  http=$(curl -sS -o /tmp/ryvo-alert-resp.$$ -w '%{http_code}' \
      --max-time 20 \
      -X POST 'https://api.resend.com/emails' \
      -H "Authorization: Bearer ${key}" \
      -H 'Content-Type: application/json' \
      -d "${payload}" 2>/tmp/ryvo-alert-err.$$) || http="000"

  if [[ "${http}" =~ ^2 ]]; then
    _alert_log "       sent to ${to} (HTTP ${http})"
    rm -f /tmp/ryvo-alert-resp.$$ /tmp/ryvo-alert-err.$$
    return 0
  fi

  # A failed send is itself worth a loud line: this is the channel of last
  # resort, so its own failure has nowhere else to go but the log.
  _alert_log "NOT SENT: mail provider returned HTTP ${http}." \
             "$(head -c 300 /tmp/ryvo-alert-resp.$$ 2>/dev/null)" \
             "$(head -c 200 /tmp/ryvo-alert-err.$$ 2>/dev/null)"
  rm -f /tmp/ryvo-alert-resp.$$ /tmp/ryvo-alert-err.$$
  return 1
}
