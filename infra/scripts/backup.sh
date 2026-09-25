#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Nightly backup for the Ryvo engine.
#   1. pg_dump the n8n Postgres (inside the container) -> /backups/n8n-DATE.sql.gz
#   2. Export all n8n workflows to JSON -> repo backups/n8n/YYYY-MM-DD/
#      NEVER workflows/: that directory is the SOURCE of every build (25 Sep 2026)
#   3. Commit the dated export (and nothing else) to git
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
# workflows/ is the SOURCE of every build. This script READS it (the drift report)
# and never writes it. On 2026-09-25 the export into workflows/ replaced the
# gated-but-undeployed Concierge build with production's older workflow and pushed
# it to main; a deploy from main that morning would have shipped the old one while
# every test said the new one passed. The source changes only by a deliberate
# commit. tests/backup_target.test.sh runs this script and fails if it ever writes
# anywhere but backups/n8n/.
WORKFLOWS_DIR="${REPO_ROOT}/workflows"
EXPORT_ROOT="${REPO_ROOT}/backups/n8n"
ENV_FILE="${REPO_ROOT}/.env"

# DATE is filesystem-only; not security-sensitive.
DATE="$(date +%Y%m%d)"
DAY="$(date +%Y-%m-%d)"
EXPORT_DIR="${EXPORT_ROOT}/${DAY}"
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

mkdir -p "${EXPORT_DIR}"
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
  # Pull the exported files from the container into the dated backup directory.
  WF_CID="$(compose ps -q n8n)"
  # The backup holds ONLY what production runs (operator, 21 Sep 2026). The deploy
  # gate's copy of the Concierge and its sink live in n8n but are test fixtures:
  # removed from the export BEFORE it reaches the repo, never committed, never pushed.
  compose exec -T n8n rm -f /tmp/wf-export/ryvoInboundConcGATE.json /tmp/wf-export/ryvoGateSink01.json /tmp/wf-export/ryvoGateCalProbe01.json /tmp/wf-export/ryvoGateCalList01.json /tmp/wf-export/ryvoGateCalClear01.json || true
  docker cp "${WF_CID}:/tmp/wf-export/." "${EXPORT_DIR}/"
  compose exec -T n8n rm -rf /tmp/wf-export || true
  echo "  -> Workflow export written to ${EXPORT_DIR}"

  # ---------------------------------------------------------------------
  # Normalise the export to pretty-printed JSON before it is committed.
  #
  # n8n exports minified: one workflow, one line. So a one-node change and a
  # whole workflow being emptied produce the SAME diff -- "1 insertion, 1
  # deletion" -- and when the repo copy was pretty-printed by hand it lands as
  # a 4,348-line rewrite instead. Either way the diff carries no information.
  #
  # On 2026-09-09 that cost a real investigation: a backup commit showed 4,348
  # deletions across the Concierge and there was no way to tell content loss
  # from whitespace without parsing both revisions. It was whitespace. The next
  # one might not be, and it will look identical.
  #
  # This is FORMATTING ONLY. Every file is parsed, re-serialised and re-parsed
  # to confirm it still means exactly the same thing, and written atomically.
  # Anything that fails any of those steps is LEFT EXACTLY AS EXPORTED: an ugly
  # backup is still a backup, a truncated one is not. The step can only ever
  # make the diff readable, never make the content wrong.
  # ---------------------------------------------------------------------
  if python3 - "${EXPORT_DIR}" <<'PYFMT'
import json, os, sys, tempfile

d = sys.argv[1]
changed = skipped = 0
for name in sorted(os.listdir(d)):
    if not name.endswith('.json'):
        continue
    path = os.path.join(d, name)
    try:
        with open(path, 'r', encoding='utf-8') as fh:
            raw = fh.read()
        obj = json.loads(raw)
        pretty = json.dumps(obj, indent=2, ensure_ascii=False) + '\n'
        if pretty == raw:
            continue
        # Round-trip: the reformatted text must parse back to the same object.
        # Without this the check is "it looked fine", which is not a check.
        if json.loads(pretty) != obj:
            print('     ! %s: round-trip changed the content, left as exported' % name)
            skipped += 1
            continue
        fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
        with os.fdopen(fd, 'w', encoding='utf-8') as fh:
            fh.write(pretty)
        os.replace(tmp, path)          # atomic; a crash leaves the old file
        changed += 1
    except Exception as e:
        print('     ! %s: %s, left as exported' % (name, e))
        skipped += 1
print('  -> Pretty-printed %d workflow file(s), %d left as exported' % (changed, skipped))
PYFMT
  then :; else
    echo "  -> WARNING: could not pretty-print the export; committing it as exported" >&2
  fi

  # An export identical to the most recent dated one adds nothing: it is removed and
  # nothing is committed. Git would store no new blobs anyway; this keeps the log and
  # the history quiet on nights when production did not change.
  PREV_DIR="$(find "${EXPORT_ROOT}" -mindepth 1 -maxdepth 1 -type d ! -name "${DAY}" | sort | tail -n 1)"
  if [[ -n "${PREV_DIR}" ]] && diff -rq "${PREV_DIR}" "${EXPORT_DIR}" >/dev/null 2>&1; then
    rm -rf "${EXPORT_DIR}"
    echo "  -> Export identical to $(basename "${PREV_DIR}"); nothing new to keep"
    COMPARE_DIR="${PREV_DIR}"
  else
    COMPARE_DIR="${EXPORT_DIR}"
  fi

  # ---------------------------------------------------------------------
  # Drift: is production what workflows/ says? Reported, never "fixed" here.
  # A build committed but not yet deployed is SUPPOSED to differ, so this is a
  # state file and a log line, not an alert; after a deploy it should read none.
  # Compared on name, nodes and connections: version metadata always differs.
  # ---------------------------------------------------------------------
  python3 - "${COMPARE_DIR}" "${WORKFLOWS_DIR}" "${STATE_DIR}/workflow_drift" <<'PYDRIFT' || echo "  -> WARNING: drift check failed to run" >&2
import json, os, sys
exp, src, out = sys.argv[1:4]
def core(p):
    d = json.load(open(p, encoding='utf-8'))
    d = d[0] if isinstance(d, list) else d
    nodes = sorted(d.get('nodes') or [], key=lambda n: n.get('name', ''))
    return json.dumps({'name': d.get('name'), 'nodes': nodes, 'connections': d.get('connections')}, sort_keys=True)
differs = []
for name in sorted(os.listdir(exp)):
    if not name.endswith('.json'):
        continue
    s = os.path.join(src, name)
    if not os.path.exists(s):
        differs.append(name + ' (not in workflows/)')
    elif core(os.path.join(exp, name)) != core(s):
        differs.append(name)
line = 'none' if not differs else 'differs: ' + ', '.join(differs)
try:
    open(out, 'w').write(line + '\n')
except Exception:
    pass
print('  -> Drift, production vs workflows/: ' + line)
PYDRIFT
fi

# 3. Commit workflow exports (only if something changed).
IS_GIT_REPO=0
if git -C "${REPO_ROOT}" rev-parse --git-dir >/dev/null 2>&1; then
  IS_GIT_REPO=1
  git -C "${REPO_ROOT}" add backups/n8n/
  if ! git -C "${REPO_ROOT}" diff --cached --quiet; then
    git -C "${REPO_ROOT}" commit -m "backup: n8n workflow export ${DAY}"
    # The guard: this commit may touch backups/n8n/ and NOTHING else. If it ever
    # does, it is undone (files left as they are) and the run fails loudly before
    # the push, so a stray change can never reach origin under a backup's name.
    OUTSIDE="$(git -C "${REPO_ROOT}" diff --name-only HEAD~1 HEAD | grep -v '^backups/n8n/' || true)"
    if [[ -n "${OUTSIDE}" ]]; then
      git -C "${REPO_ROOT}" reset --soft HEAD~1
      git -C "${REPO_ROOT}" reset -q
      echo "ERROR: the backup commit touched paths outside backups/n8n/; undone, not pushed:" >&2
      echo "${OUTSIDE}" >&2
      exit 1
    fi
    echo "  -> Committed workflow export (backups/n8n/ only)"
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
