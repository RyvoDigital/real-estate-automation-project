#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# The only supported way to run docker compose for this stack.
#
# `cd infra && docker compose up -d` LOOKS correct and is not. Compose resolves
# ${VAR} from a .env sitting NEXT TO THE COMPOSE FILE, and this project's .env
# lives at the repo root. Run it from infra/ and every variable silently
# becomes an empty string: Caddy is then asked to get a certificate for the
# host "n8n." and restart-loops, taking the public endpoint down. That is
# exactly what happened on 2026-09-04.
#
# Two defences, because one was not enough:
#   1. This wrapper, which always passes --env-file.
#   2. `${VAR:?message}` in the compose file itself, so a bad invocation fails
#      immediately and loudly instead of producing a valid-looking wrong config.
#
# Usage: infra/scripts/compose.sh up -d
#        infra/scripts/compose.sh logs -f caddy
# ---------------------------------------------------------------------------
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
[[ -f "${REPO_ROOT}/.env" ]] || { echo "ERROR: ${REPO_ROOT}/.env not found" >&2; exit 1; }
exec docker compose --env-file "${REPO_ROOT}/.env" -f "${REPO_ROOT}/infra/docker-compose.yml" "$@"
