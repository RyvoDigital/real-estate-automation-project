#!/usr/bin/env python3
"""A production deploy ships only the last GATED build (operator, 25 Sep 2026).

Drives infra/scripts/gate_record.py: the record flow (build_gate -> verify stamp -> gate
scripts' verdicts) in a throwaway state directory, and gated_build_check() against every
way the deploy must refuse. The case that prompted it: on 25 Sep the nightly backup put
production's OLD workflow on main over the gated build; the md5 check is what refuses it.

  python3 tests/deploy_gate_check.test.py
"""
import json, os, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp()
os.environ['RYVO_GATE_STATE'] = os.path.join(TMP, 'gate')
sys.path.insert(0, os.path.join(ROOT, 'infra', 'scripts'))
import gate_record as G

P = F = 0
def chk(name, cond, detail=''):
    global P, F
    P += bool(cond); F += (not cond)
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{'  ' + str(detail) if detail and not cond else ''}")

def write(p, text):
    with open(p, 'w') as fh: fh.write(text)
    return p

SRC = write(os.path.join(TMP, 'build.json.src'), '{"name": "the gated build"}\n')
OLD = write(os.path.join(TMP, 'old.json'), '{"name": "production, older"}\n')   # what the backup put on main
GATE = write(os.path.join(TMP, 'gate.json'), '{"name": "the gate copy of the build"}\n')
SAB = write(os.path.join(TMP, 'sab.json'), '{"name": "the sabotage copy"}\n')
REPO_OK = {'branch': 'main', 'head': 'abc', 'origin_head': 'abc', 'clean': True, 'file_is_source': True}
served = {'v': 'v1'}
G.served_version = lambda env, wid=G.GATE_ID: served['v']   # no docker in a unit test

print('\nthe record flow: build_gate -> verify stamps -> gate scripts record')
b = G.write_build(SRC, GATE, ROOT)
chk('build_gate records the source md5', b['source_md5'] == G.md5_file(SRC))
ok, why = G.stamp_verified(SAB, 'vS')
chk('verify never stamps a sabotage copy as the build', not ok and 'not the recorded gate build' in why, why)
ok, why = G.stamp_verified(GATE, 'v1')
chk('verify stamps the served gate copy of the build', ok and G.read_build()['verified_version'] == 'v1', why)
r = G.record('gate_run', 'PASS', {'runs': 20}, {})
chk('a gate_run on the verified gate counts for the source', r['status'] == 'VERIFIED' and r['source_md5'] == G.md5_file(SRC))
served['v'] = 'vS'
r = G.record('gate_card_paths', 'PASS', {'sabotage': True}, {})
chk('a run against another version (the sabotage copy) counts for nothing', r['status'] == 'UNVERIFIED' and r['source_md5'] is None)
served['v'] = 'v1'
G.record('gate_card_paths', 'PASS', {'sabotage': False}, {})

print('\nthe deploy check')
build, recs, md5 = G.read_build(), G.read_records(), G.md5_file(SRC)
ok, reasons, rnd = G.gated_build_check(md5, REPO_OK, build, recs)
chk('the gated build, on main, pushed, clean: PASS', ok, reasons)
chk('... and the round is printed', any('gate_run PASS' in x for x in rnd), rnd)
ok, reasons, _ = G.gated_build_check(G.md5_file(OLD), REPO_OK, build, recs)
chk('25 Sep: the backup-overwritten file is REFUSED as not the last gated build', not ok and any('not the last gated build' in x for x in reasons), reasons)
for k, v, word in (('clean', False, 'not clean'), ('branch', 'feature', 'not on main'),
                   ('origin_head', 'def', 'not origin/main'), ('file_is_source', False, 'workflows/<id>.json')):
    ok, reasons, _ = G.gated_build_check(md5, dict(REPO_OK, **{k: v}), build, recs)
    chk(f'refused: {word}', not ok and any(word in x for x in reasons), reasons)
ok, reasons, _ = G.gated_build_check(md5, REPO_OK, None, [])
chk('refused: no gate build recorded at all', not ok and any('no gate build' in x for x in reasons), reasons)
ok, reasons, _ = G.gated_build_check(md5, REPO_OK, dict(build, verified_version=None), recs)
chk('refused: the gate build was never verified as served', not ok and any('never verified' in x for x in reasons), reasons)
ten = [dict(recs[0], detail={'runs': 10})]
ok, reasons, _ = G.gated_build_check(md5, REPO_OK, build, ten)
chk('refused: only a 10-run gate', not ok and any('--runs >= 20' in x for x in reasons), reasons)
failed = recs + [dict(recs[0], script='gate_booking', verdict='FAIL', detail={'runs': 4, 'race': True}, at='z')]
ok, reasons, _ = G.gated_build_check(md5, REPO_OK, build, failed)
chk('refused: a gate script whose latest verdict is FAIL', not ok and any('FAILED' in x for x in reasons), reasons)
rerun = failed + [dict(failed[-1], verdict='PASS', at='zz')]
ok, reasons, _ = G.gated_build_check(md5, REPO_OK, build, rerun)
chk('a FAIL since rerun and passed (a tooling fix) does not block', ok, reasons)
unver = [dict(r, status='UNVERIFIED') for r in recs]
ok, reasons, _ = G.gated_build_check(md5, REPO_OK, build, unver)
chk('refused: UNVERIFIED records count for nothing', not ok, reasons)
ok, reasons, _ = G.gated_build_check('x' * 32, REPO_OK, None, [], wid='ryvoSupaKeepAlv')
chk('another production workflow needs only main/clean/pushed', ok, reasons)
ok, reasons, _ = G.gated_build_check('x' * 32, dict(REPO_OK, clean=False), None, [], wid='ryvoSupaKeepAlv')
chk('... and is refused when the tree is dirty', not ok)

print('\nSABOTAGE: the md5 comparison removed must let the 25 Sep file through')
src = open(os.path.join(ROOT, 'infra', 'scripts', 'gate_record.py')).read()
line = "    if build.get('source_md5') != file_md5:\n"
sab = src.replace(line, "    if False:\n")
chk('the sabotage applied', sab != src and line in src)
ns = {}
exec(compile(sab, 'gate_record_sabotaged', 'exec'), ns)
# the old file, with a gate record forged for its md5 so only the md5 comparison could stop it
forged = [dict(recs[0], source_md5=G.md5_file(OLD))]
ok_sab, reasons_sab, _ = ns['gated_build_check'](G.md5_file(OLD), REPO_OK, build, forged)
ok_real, reasons_real, _ = G.gated_build_check(G.md5_file(OLD), REPO_OK, build, forged)
chk('sabotaged: the old file passes (so the comparison is load-bearing)', ok_sab, reasons_sab)
chk('real: the same old file is refused', not ok_real and any('not the last gated build' in x for x in reasons_real), reasons_real)

print(f'\n{P} passed, {F} failed')
sys.exit(1 if F else 0)
