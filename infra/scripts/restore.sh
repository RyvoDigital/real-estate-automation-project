#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Restore the n8n Postgres from a backup produced by backup.sh.
#
#   ./restore.sh /path/to/backups/n8n-YYYYMMDD.sql.gz
#       DESTRUCTIVE. Drops and recreates the live n8n database, stopping n8n
#       for the duration. Requires typing 'restore' to confirm.
#
#   ./restore.sh --target-db n8n_restore_drill /path/to/n8n-YYYYMMDD.sql.gz
#       DRILL MODE. Restores into a scratch database instead. Never touches the
#       live database and never stops n8n. This is how you rehearse a restore
#       without an outage -- see docs/restore-drill.md.
#
# Options:
#   --target-db NAME   Restore into NAME instead of the live database.
#   --yes              Skip the interactive confirmation (drill mode only;
#                      restoring over the live database always prompts).
#
# Note: restoring the DB alone is not enough to use saved n8n credentials --
# they are encrypted with N8N_ENCRYPTION_KEY. The exact same key must be present
# in .env / n8n_data, or stored credentials remain unreadable.
# -----------------------------------------------------------------------------
set -euo pipefail

TARGET_DB=""
ASSUME_YES=0
DUMP_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target-db) TARGET_DB="${2:-}"; shift 2 ;;
    --yes)       ASSUME_YES=1; shift ;;
    -h|--help)   sed -n '2,25p' "$0"; exit 0 ;;
    -*)          echo "ERROR: unknown option '$1'" >&2; exit 1 ;;
    *)           DUMP_FILE="$1"; shift ;;
  esac
done

if [[ -z "${DUMP_FILE}" || ! -f "${DUMP_FILE}" ]]; then
  echo "Usage: $0 [--target-db NAME] [--yes] /path/to/n8n-YYYYMMDD.sql.gz" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INFRA_DIR="${REPO_ROOT}/infra"
ENV_FILE="${REPO_ROOT}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

# A malformed .env that leaves these empty must not reach a DROP DATABASE.
: "${N8N_DB_NAME:?N8N_DB_NAME is empty -- check .env}"
: "${N8N_DB_USER:?N8N_DB_USER is empty -- check .env}"

TARGET_DB="${TARGET_DB:-${N8N_DB_NAME}}"

# Identifiers are interpolated into SQL, so constrain them to a safe shape
# rather than trusting .env or the command line.
if [[ ! "${TARGET_DB}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "ERROR: unsafe database name '${TARGET_DB}'." >&2
  exit 1
fi
case "${TARGET_DB}" in
  postgres|template0|template1)
    echo "ERROR: refusing to restore over the '${TARGET_DB}' system database." >&2
    exit 1 ;;
esac

if [[ "${TARGET_DB}" == "${N8N_DB_NAME}" ]]; then
  MODE="live"
else
  MODE="drill"
fi

compose() { docker compose --env-file "${ENV_FILE}" -f "${INFRA_DIR}/docker-compose.yml" "$@"; }
psql_as() { compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "${N8N_DB_USER}" "$@"; }

# 1. Verify the archive BEFORE destroying anything. A truncated dump must be
#    discovered while the current database is still intact.
echo "Verifying ${DUMP_FILE}..."
if ! gzip -t "${DUMP_FILE}"; then
  echo "ERROR: ${DUMP_FILE} fails gzip integrity check. Refusing to restore." >&2
  exit 1
fi
if ! gunzip -c "${DUMP_FILE}" | tail -20 | grep -q 'PostgreSQL database dump complete'; then
  echo "ERROR: ${DUMP_FILE} has no 'dump complete' trailer -- it is truncated." >&2
  exit 1
fi
echo "  -> gzip OK, dump trailer present"

# 2. Confirm. Restoring over the live database always prompts, regardless of
#    --yes: that path stops n8n and is unrecoverable.
if [[ "${MODE}" == "live" ]]; then
  echo
  echo "About to RESTORE ${DUMP_FILE} into the LIVE database '${TARGET_DB}'."
  echo "This DROPS the current '${TARGET_DB}' database and stops n8n. This cannot be undone."
  read -r -p "Type 'restore' to continue: " CONFIRM
  if [[ "${CONFIRM}" != "restore" ]]; then
    echo "Aborted."
    exit 1
  fi
elif [[ "${ASSUME_YES}" -ne 1 ]]; then
  echo
  echo "DRILL: restore ${DUMP_FILE} into scratch database '${TARGET_DB}'."
  echo "The live database '${N8N_DB_NAME}' and the running n8n are NOT touched."
  read -r -p "Type 'drill' to continue: " CONFIRM
  if [[ "${CONFIRM}" != "drill" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# 3. In live mode, n8n must not hold connections during the drop -- and must
#    come back up even if the restore fails partway.
if [[ "${MODE}" == "live" ]]; then
  N8N_STOPPED=0
  restart_n8n() {
    if [[ "${N8N_STOPPED}" -eq 1 ]]; then
      echo "Restarting n8n..."
      compose start n8n || echo "WARNING: could not restart n8n -- start it manually." >&2
    fi
  }
  trap restart_n8n EXIT
  echo "Stopping n8n to release DB connections..."
  compose stop n8n
  N8N_STOPPED=1
fi

echo "Recreating database '${TARGET_DB}'..."
# WITH (FORCE) terminates any leftover sessions; without it the drop fails
# whenever a stray psql or a not-yet-closed pool connection is still attached.
psql_as -d postgres -c "DROP DATABASE IF EXISTS \"${TARGET_DB}\" WITH (FORCE);"
psql_as -d postgres -c "CREATE DATABASE \"${TARGET_DB}\" OWNER \"${N8N_DB_USER}\";"

echo "Loading dump..."
# ON_ERROR_STOP + --single-transaction: without these psql exits 0 after
# failing every statement, and the restore reports success over an empty
# database. All-or-nothing is the only honest outcome here.
gunzip -c "${DUMP_FILE}" | psql_as --single-transaction -d "${TARGET_DB}" >/dev/null

# 4. Verify the restore actually landed instead of asserting it did.
echo "Verifying restored database..."
TABLE_COUNT="$(psql_as -At -d "${TARGET_DB}" -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" | tr -d '[:space:]')"
if [[ "${TABLE_COUNT}" -lt 1 ]]; then
  echo "ERROR: restored database '${TARGET_DB}' has no tables." >&2
  exit 1
fi
echo "  -> ${TABLE_COUNT} tables in '${TARGET_DB}'"
psql_as -At -d "${TARGET_DB}" -c \
  "SELECT '  -> users='||count(*) FROM \"user\";" || true
psql_as -At -d "${TARGET_DB}" -c \
  "SELECT '  -> workflows='||count(*) FROM workflow_entity;" || true
psql_as -At -d "${TARGET_DB}" -c \
  "SELECT '  -> credentials='||count(*) FROM credentials_entity;" || true

if [[ "${MODE}" == "drill" ]]; then
  echo
  echo "Drill restore complete into '${TARGET_DB}'. Live database untouched."
  echo "Clean up when finished:"
  echo "  docker compose --env-file ${ENV_FILE} -f ${INFRA_DIR}/docker-compose.yml \\"
  echo "    exec -T postgres psql -U ${N8N_DB_USER} -d postgres \\"
  echo "    -c 'DROP DATABASE IF EXISTS \"${TARGET_DB}\" WITH (FORCE);'"
else
  echo "Restore complete."
fi
