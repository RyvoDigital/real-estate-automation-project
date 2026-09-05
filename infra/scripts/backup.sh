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
STATE_DIR="${STATE_DIR:-/var/lib/ryvo}"

# ---------------------------------------------------------------------------
# Report the outcome, whatever it is.
#
# Until Checkpoint D1 this script exited non-zero on failure and nothing read
# it: the only record was a line in /var/log/ryvo-backup.log that somebody had
# to go and look at. A backup whose failure is pull-only is a backup you find
# out about when you need it.
#
# The trap covers EVERY exit path, including `set -e` aborts partway through --
# which is exactly where a hand-placed alert call gets missed.
# ---------------------------------------------------------------------------
# shellcheck source=/dev/null
. "${SCRIPT_DIR}/alert.sh"
mkdir -p "${STATE_DIR}" 2>/dev/null || true

_backup_finish() {
  local rc=$?
  if (( rc == 0 )); then
    printf 'ok\n' > "${STATE_DIR}/backup.status" 2>/dev/null || true
  else
    printf 'failed:exit_%s\n' "${rc}" > "${STATE_DIR}/backup.status" 2>/dev/null || true
    ryvo_alert "Ryvo: nightly backup FAILED (exit ${rc})" \
      "$(printf 'The nightly backup exited %s at %s.\n\nHost: %s\nLog: /var/log/ryvo-backup.log\n\nLast lines:\n%s' \
         "${rc}" "$(date -Iseconds)" "$(hostname)" \
         "$(tail -n 15 /var/log/ryvo-backup.log 2>/dev/null)")" || true
  fi
  return "${rc}"
}
trap _backup_finish EXIT

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
# n8n exits 1 with "No workflows found with specified filters" when the
# instance has no workflows, which is the normal state until Phase 1 builds the
# first automation. That must not fail the backup: otherwise cron reports a
# failure every night and the operator learns to ignore the log. Any OTHER
# export failure is real and still aborts.
# ---------------------------------------------------------------------------
# Pull BEFORE exporting, not after committing.
#
# On 2026-09-05 this script failed for the first time in production: commits
# pushed from the laptop left the server behind origin, so its export commit
# was rejected non-fast-forward and the night's workflow export never reached
# GitHub. Pulling after the commit exists means rebasing a fresh export onto
# remote changes to the same file -- a conflict the script would have to guess
# its way out of.
#
# Pulling first removes the conflict entirely: the tree is brought up to date,
# THEN the export overwrites workflows/ with what n8n actually holds, which is
# canonical by definition. A pull that fails is loud and aborts, because
# committing an export on top of a stale tree is how the two copies diverge.
# ---------------------------------------------------------------------------
if git -C "${REPO_ROOT}" rev-parse --git-dir >/dev/null 2>&1; then
  PULL_BRANCH="$(git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD)"
  if ! git -C "${REPO_ROOT}" diff --quiet || ! git -C "${REPO_ROOT}" diff --cached --quiet; then
    echo "ERROR: the repo has uncommitted changes; refusing to pull over them." >&2
    echo "       Reconcile ${REPO_ROOT} by hand, then re-run." >&2
    exit 1
  fi
  if git -C "${REPO_ROOT}" pull --rebase --quiet origin "${PULL_BRANCH}"; then
    echo "  -> Repo up to date with origin/${PULL_BRANCH}"
  else
    git -C "${REPO_ROOT}" rebase --abort 2>/dev/null || true
    echo "ERROR: could not bring ${REPO_ROOT} up to date with origin." >&2
    echo "       Not exporting on top of a stale tree." >&2
    exit 1
  fi
fi

mkdir -p "${WORKFLOWS_DIR}"
EXPORT_RC=0
EXPORT_OUT="$(compose exec -T n8n n8n export:workflow --all --separate \
  --output=/tmp/wf-export 2>&1)" || EXPORT_RC=$?

if [[ "${EXPORT_RC}" -ne 0 ]]; then
  if grep -qi 'no workflows found' <<< "${EXPORT_OUT}"; then
    echo "  -> No workflows in n8n yet; nothing to export (expected pre-Phase 1)"
  else
    echo "ERROR: n8n workflow export failed (exit ${EXPORT_RC}):" >&2
    echo "${EXPORT_OUT}" >&2
    exit 1
  fi
else
  # Pull the exported files from the container into the repo workflows/ dir.
  WF_CID="$(compose ps -q n8n)"
  docker cp "${WF_CID}:/tmp/wf-export/." "${WORKFLOWS_DIR}/"
  compose exec -T n8n rm -rf /tmp/wf-export || true
  echo "  -> Workflow export refreshed in ${WORKFLOWS_DIR}"
fi

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
