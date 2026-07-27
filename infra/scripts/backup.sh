#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Nightly backup for the Ryvo engine.
#   1. pg_dump the n8n Postgres (inside the container) -> /backups/n8n-DATE.sql.gz
#   2. Export all n8n workflows to JSON -> repo workflows/ (the reusable library)
#   3. Commit the workflow exports to git
#   4. Retain the last 14 daily DB dumps; delete older
#
# Schedule via cron, nightly 03:00 Europe/Lisbon, e.g.:
#   0 3 * * *  /opt/ryvo-automation-platform/infra/scripts/backup.sh >> /var/log/ryvo-backup.log 2>&1
#
# Run from anywhere; paths are resolved relative to the repo root.
# Requires: docker compose, git, and a .env at the repo root.
# -----------------------------------------------------------------------------
set -euo pipefail

# Resolve repo root from this script's location (infra/scripts -> repo root).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INFRA_DIR="${REPO_ROOT}/infra"
BACKUP_DIR="${REPO_ROOT}/backups"
WORKFLOWS_DIR="${REPO_ROOT}/workflows"
ENV_FILE="${REPO_ROOT}/.env"

# DATE is filesystem-only; not security-sensitive.
DATE="$(date +%Y%m%d)"
RETENTION_DAYS=14

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found. Create it on the server first." >&2
  exit 1
fi

# Load N8N_DB_USER / N8N_DB_NAME for the dump command.
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

mkdir -p "${BACKUP_DIR}"

compose() { docker compose --env-file "${ENV_FILE}" -f "${INFRA_DIR}/docker-compose.yml" "$@"; }

echo "[$(date -Iseconds)] Starting backup ${DATE}"

# 1. Postgres dump (streamed out of the container, gzipped on the host).
DUMP_FILE="${BACKUP_DIR}/n8n-${DATE}.sql.gz"
compose exec -T postgres pg_dump -U "${N8N_DB_USER}" "${N8N_DB_NAME}" | gzip > "${DUMP_FILE}"
echo "  -> DB dump: ${DUMP_FILE} ($(du -h "${DUMP_FILE}" | cut -f1))"

# 2. Export all n8n workflows to JSON into the repo (one file per workflow).
mkdir -p "${WORKFLOWS_DIR}"
compose exec -T n8n n8n export:workflow --all --separate --output=/tmp/wf-export >/dev/null
# Pull the exported files from the container into the repo workflows/ dir.
WF_CID="$(compose ps -q n8n)"
docker cp "${WF_CID}:/tmp/wf-export/." "${WORKFLOWS_DIR}/"
compose exec -T n8n rm -rf /tmp/wf-export || true
echo "  -> Workflow export refreshed in ${WORKFLOWS_DIR}"

# 3. Commit workflow exports (only if something changed).
IS_GIT_REPO=0
if git -C "${REPO_ROOT}" rev-parse --git-dir >/dev/null 2>&1; then
  IS_GIT_REPO=1
  git -C "${REPO_ROOT}" add workflows/
  if ! git -C "${REPO_ROOT}" diff --cached --quiet; then
    git -C "${REPO_ROOT}" commit -m "backup: n8n workflow export ${DATE}"
    echo "  -> Committed workflow export"
  else
    echo "  -> No workflow changes to commit"
  fi
else
  echo "  -> WARNING: not a git repo; skipped workflow commit" >&2
fi

# 4. Retention: delete DB dumps older than RETENTION_DAYS.
# Runs BEFORE the push so that a push failure (network, revoked deploy key)
# can never leave old dumps accumulating until the disk fills.
find "${BACKUP_DIR}" -name 'n8n-*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -delete
echo "  -> Pruned DB dumps older than ${RETENTION_DAYS} days"

# 5. Push the workflow library offsite to GitHub (deploy key, write access).
# A commit that never leaves the box is not a backup, so a push failure is a
# loud non-zero exit -- by this point the dump and prune have already happened.
if [[ "${IS_GIT_REPO}" -eq 1 ]]; then
  BRANCH="$(git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD)"
  if [[ -z "$(git -C "${REPO_ROOT}" log --oneline "origin/${BRANCH}..${BRANCH}" 2>/dev/null)" ]]; then
    echo "  -> Nothing to push (in sync with origin/${BRANCH})"
  elif git -C "${REPO_ROOT}" push origin "${BRANCH}"; then
    echo "  -> Pushed workflow export to origin/${BRANCH}"
  else
    echo "ERROR: git push failed. Workflow exports are committed locally but NOT" >&2
    echo "       backed up offsite. Check the deploy key and network." >&2
    exit 1
  fi
fi

echo "[$(date -Iseconds)] Backup complete"
