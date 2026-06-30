#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Restore the n8n Postgres from a backup produced by backup.sh.
#
#   ./restore.sh /path/to/backups/n8n-YYYYMMDD.sql.gz
#
# DESTRUCTIVE: this drops and recreates the n8n database. Stop n8n first so it
# is not writing during the restore. Re-confirms before proceeding.
#
# Note: restoring the DB alone is not enough to use saved n8n credentials —
# they are encrypted with N8N_ENCRYPTION_KEY. The exact same key must be present
# in .env / n8n_data, or stored credentials remain unreadable.
# -----------------------------------------------------------------------------
set -euo pipefail

DUMP_FILE="${1:-}"
if [[ -z "${DUMP_FILE}" || ! -f "${DUMP_FILE}" ]]; then
  echo "Usage: $0 /path/to/n8n-YYYYMMDD.sql.gz" >&2
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

compose() { docker compose --env-file "${ENV_FILE}" -f "${INFRA_DIR}/docker-compose.yml" "$@"; }

echo "About to RESTORE ${DUMP_FILE} into database '${N8N_DB_NAME}'."
echo "This DROPS the current '${N8N_DB_NAME}' database. This cannot be undone."
read -r -p "Type 'restore' to continue: " CONFIRM
if [[ "${CONFIRM}" != "restore" ]]; then
  echo "Aborted."
  exit 1
fi

echo "Stopping n8n to release DB connections..."
compose stop n8n

echo "Recreating database..."
compose exec -T postgres psql -U "${N8N_DB_USER}" -d postgres \
  -c "DROP DATABASE IF EXISTS \"${N8N_DB_NAME}\";" \
  -c "CREATE DATABASE \"${N8N_DB_NAME}\" OWNER \"${N8N_DB_USER}\";"

echo "Loading dump..."
gunzip -c "${DUMP_FILE}" | compose exec -T postgres psql -U "${N8N_DB_USER}" -d "${N8N_DB_NAME}"

echo "Restarting n8n..."
compose start n8n

echo "Restore complete."
