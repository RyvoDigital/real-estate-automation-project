"""The deploy gate's own record: which build was gated, and what every gate script said.

Operator's rule (25 Sep 2026): a Concierge deploy ships only the LAST GATED BUILD.
That morning the nightly backup had replaced the gated-but-undeployed workflow on main
with production's older one; a deploy from main would have shipped it while every test
said the new build passed, and only a hand-run md5 comparison stood in the way. This
module makes that comparison the deploy's own precondition.

The record is SERVER-LOCAL (/var/lib/ryvo/gate/, RYVO_GATE_STATE overrides), never
committed: gates and deploys both run on the server, and a record committed from the
server would be a second writer on main, the very thing being fixed.

  build.json     tests/build_gate.py: the SOURCE md5 + commit of the gate copy, and
                 the gate file's md5. Stamped by `n8n_api_deploy.py verify` on the gate
                 id, when every check passes, with the gate versionId it verified: the
                 served gate copy is then PROVEN to be that source.
  records.jsonl  each gate script's verdict. It counts toward a source md5 ONLY when the
                 gate version served at the end of the run is the verified one; otherwise
                 it is UNVERIFIED and counts for nothing.

Importable, no side effects. The pure check is gated_build_check(); tests/
deploy_gate_check.test.py drives it.
"""
import hashlib, json, os, subprocess, time

STATE = os.environ.get('RYVO_GATE_STATE', '/var/lib/ryvo/gate')
GATE_ID = 'ryvoInboundConcGATE'
CONCIERGE_ID = 'ryvoInboundConc01'
MIN_GATE_RUNS = 20   # CLAUDE.md: the live-check conversation at least 20 times


def md5_file(path):
    with open(path, 'rb') as fh:
        return hashlib.md5(fh.read()).hexdigest()


def _now():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def _path(name):
    return os.path.join(STATE, name)


def read_build():
    try:
        with open(_path('build.json'), encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def read_records():
    out = []
    try:
        with open(_path('records.jsonl'), encoding='utf-8') as fh:
            for line in fh:
                line = line.strip()
                if line:
                    try: out.append(json.loads(line))
                    except ValueError: pass
    except OSError:
        pass
    return out


def _git(repo, *args):
    r = subprocess.run(['git', '-C', repo] + list(args), capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def write_build(source_path, gate_path, repo):
    """tests/build_gate.py: the gate copy was built from `source_path`."""
    os.makedirs(STATE, exist_ok=True)
    rel = os.path.relpath(os.path.abspath(source_path), repo)
    dirty = _git(repo, 'status', '--porcelain', '--', rel)
    b = {'source': rel, 'source_md5': md5_file(source_path), 'source_commit': _git(repo, 'rev-parse', 'HEAD'),
         'source_committed': dirty == '', 'gate_md5': md5_file(gate_path), 'built_at': _now(),
         'verified_version': None, 'verified_at': None}
    with open(_path('build.json'), 'w', encoding='utf-8') as fh:
        json.dump(b, fh, indent=1)
    return b


def stamp_verified(gate_file, version_id):
    """n8n_api_deploy.py verify, on the gate id, ALL PASS: the served gate IS the recorded build.
    Returns (stamped, why). A file that is not the recorded gate build (the sabotage copy)
    is never stamped."""
    b = read_build()
    if not b:
        return False, 'no build.json: run tests/build_gate.py first'
    if md5_file(gate_file) != b['gate_md5']:
        return False, 'this file is not the recorded gate build (a sabotage copy?); not stamped'
    b['verified_version'] = version_id
    b['verified_at'] = _now()
    with open(_path('build.json'), 'w', encoding='utf-8') as fh:
        json.dump(b, fh, indent=1)
    return True, 'stamped'


def served_version(env, wid=GATE_ID):
    """The activeVersionId n8n serves for `wid`, read from its own database."""
    q = f"""select coalesce("activeVersionId",'') from workflow_entity where id='{wid}'"""
    r = subprocess.run(['docker', 'exec', '-i', 'infra-postgres-1', 'psql', '-U', env['N8N_DB_USER'], '-d',
                        env['N8N_DB_NAME'], '-At', '-c', q], capture_output=True, text=True)
    return r.stdout.strip() or None


def record(script, verdict, detail, env):
    """A gate script's verdict, bound to a source md5 only if the gate it ran against is
    the verified build."""
    os.makedirs(STATE, exist_ok=True)
    b = read_build() or {}
    served = served_version(env)
    verified = bool(served) and served == b.get('verified_version')
    rec = {'script': script, 'verdict': verdict, 'detail': detail, 'at': _now(), 'served_version': served,
           'status': 'VERIFIED' if verified else 'UNVERIFIED',
           'source_md5': b.get('source_md5') if verified else None,
           'source_commit': b.get('source_commit') if verified else None}
    with open(_path('records.jsonl'), 'a', encoding='utf-8') as fh:
        fh.write(json.dumps(rec) + '\n')
    print(f'gate record: {script} {verdict} {rec["status"]}'
          + (f' for source {rec["source_md5"][:8]} ({(rec["source_commit"] or "?")[:7]})' if verified else
             ' (the gate served is not the verified build: this verdict counts for nothing)'))
    return rec


def gated_build_check(file_md5, repo_state, build, records, wid=CONCIERGE_ID):
    """Pure. -> (ok, reasons, round) for `deploy --production`.
    repo_state: {branch, head, origin_head, clean, file_is_source}."""
    reasons = []
    rs = repo_state or {}
    if rs.get('branch') != 'main': reasons.append(f"not on main (on {rs.get('branch')!r})")
    if not rs.get('clean'): reasons.append('the working tree is not clean')
    if not rs.get('head') or rs.get('head') != rs.get('origin_head'):
        reasons.append('HEAD is not origin/main: the file being deployed is not what main holds')
    if not rs.get('file_is_source'): reasons.append('the file is not the tracked workflows/<id>.json on main')
    rnd = []
    if wid != CONCIERGE_ID:
        return (not reasons), reasons, rnd
    if not build:
        reasons.append('no gate build recorded: run the gate under the current tooling first')
        return False, reasons, rnd
    if not build.get('verified_version'):
        reasons.append('the gate build was never verified as served (n8n_api_deploy.py verify on the gate id)')
    if build.get('source_md5') != file_md5:
        reasons.append(f"the file (md5 {file_md5[:8]}) is not the last gated build (md5 {(build.get('source_md5') or '?')[:8]})")
    mine = [r for r in records if r.get('status') == 'VERIFIED' and r.get('source_md5') == file_md5]
    rnd = [f"{r['at']} {r['script']} {r['verdict']} {json.dumps(r.get('detail'), sort_keys=True)}" for r in mine]
    gate20 = [r for r in mine if r.get('script') == 'gate_run' and r.get('verdict') == 'PASS'
              and int((r.get('detail') or {}).get('runs') or 0) >= MIN_GATE_RUNS]
    if not gate20:
        reasons.append(f'no VERIFIED gate_run PASS with --runs >= {MIN_GATE_RUNS} for this build')
    # A script's LATEST verdict for this build counts: a failure that a rerun of the
    # same script with the same arguments has since passed (a tooling fix) does not block.
    latest = {}
    for r in mine:
        latest[(r.get('script'), json.dumps(r.get('detail'), sort_keys=True))] = r
    failed = [r for r in latest.values() if r.get('verdict') != 'PASS']
    if failed:
        reasons.append('a gate script FAILED on this build: ' + ', '.join(f"{r['script']} {r['at']}" for r in failed))
    return (not reasons), reasons, rnd
