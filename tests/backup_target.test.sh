#!/usr/bin/env bash
# The nightly backup never writes a SOURCE file (operator, 25 Sep 2026).
#
# Runs the REAL infra/scripts/backup.sh end to end in a throwaway repo: a local bare
# repo as origin, a stub `docker` that returns a fake dump and a fake n8n export, a
# no-op alert. Then asserts what the run changed. On 25 Sep 2026 the export went into
# workflows/ -- the source of every build -- and replaced a gated, undeployed build
# with production's older workflow on main.
#
# Then the sabotage: the same run against a copy of backup.sh whose target is put
# back to workflows/. That run MUST fail these checks, or the checks prove nothing.
#
#   ./tests/backup_target.test.sh
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0; FAIL=0
chk() { if eval "$2"; then PASS=$((PASS+1)); echo "  [PASS] $1"; else FAIL=$((FAIL+1)); echo "  [FAIL] $1"; fi; }

# fingerprint <repo> -> a checksum line per tracked file outside backups/n8n/ (portable: shasum)
fingerprint() { (cd "$1" && git ls-files | grep -v '^backups/n8n/' | while read -r f; do shasum "$f"; done); }

# run_case <backup.sh to test> <workdir>  -> leaves the result in <workdir>; echoes its own failures
run_case() {
  local script="$1" W="$2" fails=0
  local R="${W}/repo" O="${W}/origin.git" BIN="${W}/bin" EXP="${W}/export" ST="${W}/state"
  mkdir -p "${R}/workflows" "${R}/src" "${R}/infra/scripts" "${BIN}" "${EXP}" "${ST}"
  git init -q --bare "${O}"
  git -C "${R}" init -q -b main
  git -C "${R}" config user.email t@t; git -C "${R}" config user.name t
  cp "${REPO}/.gitignore" "${R}/.gitignore"
  cp "${script}" "${R}/infra/scripts/backup.sh"
  printf 'ryvo_alert() { echo "ALERT: $1" >> "%s/alerts"; }\n' "${W}" > "${R}/infra/scripts/alert.sh"
  printf 'N8N_DB_USER=u\nN8N_DB_NAME=d\n' > "${R}/.env"
  # The source: a workflow production matches (a) and one a build has moved on from (b).
  printf '{\n  "name": "A",\n  "nodes": [],\n  "connections": {}\n}\n' > "${R}/workflows/a.json"
  printf '{\n  "name": "B",\n  "nodes": [{"name": "new"}],\n  "connections": {}\n}\n' > "${R}/workflows/b.json"
  echo 'const x = 1;' > "${R}/src/x.js"
  git -C "${R}" add -A && git -C "${R}" commit -q -m init
  git -C "${R}" remote add origin "${O}" && git -C "${R}" push -q origin main
  # What "production" serves: a identical, b older, plus a gate fixture that must be dropped.
  printf '{"name":"A","nodes":[],"connections":{}}' > "${EXP}/a.json"
  printf '{"name":"B","nodes":[{"name":"old"}],"connections":{}}' > "${EXP}/b.json"
  printf '{"name":"GATE"}' > "${EXP}/ryvoInboundConcGATE.json"
  cat > "${BIN}/docker" <<EOF
#!/usr/bin/env bash
# stub: docker compose ... exec/ps, and docker cp
args="\$*"
case "\$args" in
  *pg_dump*) echo "fake dump";;
  *"export:workflow"*) mkdir -p "${W}/wf-export" && cp "${EXP}"/*.json "${W}/wf-export/";;
  *"rm -f /tmp/wf-export"*) rm -f "${W}/wf-export/ryvoInboundConcGATE.json" "${W}/wf-export/ryvoGateSink01.json";;
  *"rm -rf /tmp/wf-export"*) rm -rf "${W}/wf-export";;
  *"ps -q n8n"*) echo cid;;
  cp*) dest="\${@: -1}"; cp -R "${W}/wf-export/." "\$dest";;
esac
EOF
  chmod +x "${BIN}/docker"
  # the tracked source, fingerprinted before the run
  fingerprint "${R}" > "${W}/before.md5"
  PATH="${BIN}:${PATH}" STATE_DIR="${ST}" bash "${R}/infra/scripts/backup.sh" > "${W}/run1.log" 2>&1
  echo $? > "${W}/rc1"
  fingerprint "${R}" > "${W}/after.md5"
  PATH="${BIN}:${PATH}" STATE_DIR="${ST}" bash "${R}/infra/scripts/backup.sh" > "${W}/run2.log" 2>&1
  echo $? > "${W}/rc2"
}

check_case() {
  local W="$1" R="$1/repo" DAY; DAY="$(date +%Y-%m-%d)"
  local DUMP; DUMP="backups/n8n-$(date +%Y%m%d).sql.gz"
  chk 'the run exited 0' "[ \"\$(cat ${W}/rc1)\" = 0 ]"
  chk 'every source file is byte-identical after the run (workflows/, src/, infra/, .gitignore)' "cmp -s ${W}/before.md5 ${W}/after.md5"
  chk 'workflows/b.json still holds the BUILD, not production' "grep -q '\"new\"' ${R}/workflows/b.json"
  chk "the export is in backups/n8n/${DAY}/" "[ -f ${R}/backups/n8n/${DAY}/a.json ] && [ -f ${R}/backups/n8n/${DAY}/b.json ]"
  chk 'the gate fixture never reached the repo' "[ ! -e ${R}/backups/n8n/${DAY}/ryvoInboundConcGATE.json ] && [ ! -e ${R}/workflows/ryvoInboundConcGATE.json ]"
  chk 'the backup commit touches backups/n8n/ and nothing else' "[ -z \"\$(git -C ${R} diff --name-only HEAD~1 HEAD 2>/dev/null | grep -v '^backups/n8n/')\" ] && [ -n \"\$(git -C ${R} diff --name-only HEAD~1 HEAD 2>/dev/null)\" ]"
  chk 'it was pushed to origin' "[ \"\$(git -C ${R} rev-parse HEAD)\" = \"\$(git -C ${W}/origin.git rev-parse main)\" ]"
  chk 'the DB dump exists and is IGNORED, never tracked' "[ -f ${R}/${DUMP} ] && git -C ${R} check-ignore -q ${DUMP} && [ -z \"\$(git -C ${R} ls-files backups/ | grep -v '^backups/n8n/')\" ]"
  chk 'drift is reported for b (the build moved on), not for a' "grep -q 'differs: b.json' ${W}/state/workflow_drift 2>/dev/null && ! grep -q 'a.json' ${W}/state/workflow_drift"
  chk 'a second run with the same export exits 0 and commits nothing' "[ \"\$(cat ${W}/rc2)\" = 0 ] && [ \"\$(git -C ${R} rev-list --count HEAD)\" = 2 ]"
  chk 'no alert was raised' "[ ! -s ${W}/alerts ]"
}

TMP="$(mktemp -d)"; trap 'rm -rf "${TMP}"' EXIT
echo; echo 'the real backup.sh'
run_case "${REPO}/infra/scripts/backup.sh" "${TMP}/real"
check_case "${TMP}/real"
REAL_FAIL=${FAIL}

echo; echo 'SABOTAGE: the same script with its export target put back to workflows/ (must go red)'
SAB="${TMP}/backup.sabotaged.sh"
sed -e 's|^EXPORT_DIR="${EXPORT_ROOT}/${DAY}"|EXPORT_DIR="${WORKFLOWS_DIR}"|' "${REPO}/infra/scripts/backup.sh" > "${SAB}"
if cmp -s "${SAB}" "${REPO}/infra/scripts/backup.sh"; then
  echo '  [FAIL] the sabotage did not apply'; FAIL=$((FAIL+1)); SAB_FAILS=0
else
  echo '  [PASS] the sabotage applied'; PASS=$((PASS+1))
  BEFORE=${FAIL}
  run_case "${SAB}" "${TMP}/sab"
  check_case "${TMP}/sab" > "${TMP}/sab.out"
  SAB_FAILS=$(grep -c '\[FAIL\]' "${TMP}/sab.out")
  FAIL=${BEFORE}   # the sabotaged run's failures are the EXPECTED outcome, not the test's
  sed 's/^/    (sabotaged) /' "${TMP}/sab.out" | grep FAIL
fi
chk "the sabotaged backup goes red (${SAB_FAILS} checks failed)" "[ ${SAB_FAILS} -gt 0 ]"

echo; echo "${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ] && [ "${REAL_FAIL}" -eq 0 ]
