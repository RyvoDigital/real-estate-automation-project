#!/usr/bin/env python3
"""Deploy an n8n workflow through n8n's own public API: no import, no restart.

  python3 infra/scripts/n8n_api_deploy.py deploy   --id ID --file F
  python3 infra/scripts/n8n_api_deploy.py activate --id ID --version VERSION_ID
  python3 infra/scripts/n8n_api_deploy.py verify   --id ID --file F --path WEBHOOK_PATH [--signed-probe]
  python3 infra/scripts/n8n_api_deploy.py state    --id ID

Run ON THE SERVER. Reads N8N_API_KEY from the repo's .env and hands it to node inside
the n8n container on STDIN; it never appears in argv, the environment, a URL or the output.
Caddy refuses /api/* from outside, so the API is only reachable from within the server.

WHY (21 Sep 2026): `n8n import:workflow` DELETES the workflow's webhook_entity row
and `publish:workflow` does not recreate it, so the CLI route needs a restart.
`PUT /api/v1/workflows/{id}` on a published workflow saves the new version AND
republishes it inside the running instance (publishIfActive -> activateWorkflow ->
activeWorkflowManager.add), which is what registers webhooks.

FAILURE, MEASURED on the gate copy (21 Sep 2026, n8n 2.28.3). Neither failure leaves
the old version serving:
  * a check n8n runs BEFORE activating (e.g. a webhook-path conflict): HTTP 409, but
    activeVersionId has already moved to the rejected version while the OLD
    registration stays in memory. Every request to the path returns 500, and the
    webhook row is still there, so a row check alone says healthy;
  * a failure INSIDE trigger registration (e.g. an invalid cron): HTTP 400, n8n
    deregisters it, active=false, activeVersionId=NULL, no row, 404.
So `deploy` ROLLS BACK AT ONCE on any non-200: it re-activates the version that was
active before (POST /workflows/{id}/activate {versionId}). Every published version
stays in workflow_history, so a rollback needs no file. Measured: this restores the
row, 403 and the served code from both states, with no restart.

NOTE: execution_entity.workflowVersionId records the workflow's current DRAFT id, not
the version that ran. `verify --signed-probe` therefore compares the code the
execution actually ran (its snapshot) with the file.

Production workflow ids are refused unless --production is given.
"""
import argparse, base64, hashlib, hmac, json, subprocess, sys, time, urllib.error, urllib.parse, urllib.request, uuid

REPO = '/opt/ryvo-automation-platform'
BASE = 'https://n8n.ryvodigital.com'
PRODUCTION_IDS = {'ryvoInboundConc01', 'ryvoErrorHandler01', 'ryvoHeartbeat01', 'ryvoSupaKeepAlv',
                  'ryvoCockpitDrft1', 'ryvoCockpitMap1', 'ryvoCockpitSnd1', 'ryvoCockpitVal1'}
PUBLIC_URL = 'https://n8n.ryvodigital.com/webhook/twilio-inbound'   # VerifySignature's constant
GATE_NUMBER = '+351900009000'

E = {}
for l in open(REPO + '/.env', encoding='utf-8'):
    l = l.rstrip('\n')
    if l and not l.startswith('#') and '=' in l:
        k, v = l.split('=', 1); E[k] = v


# The API is called from INSIDE the n8n container (node's fetch on localhost:5678),
# because Caddy refuses /api/* from everywhere (21 Sep 2026). The key travels on
# stdin: never in argv, the environment or a URL, so it shows in no process list.
_NODE_CALL = r"""
let raw = ''; process.stdin.on('data', d => raw += d).on('end', async () => {
  const q = JSON.parse(raw);
  try {
    const r = await fetch('http://localhost:5678/api/v1' + q.path, { method: q.method,
      headers: { 'X-N8N-API-KEY': q.key, 'Content-Type': 'application/json', accept: 'application/json' },
      body: q.body == null ? undefined : JSON.stringify(q.body) });
    const t = await r.text();
    process.stdout.write(JSON.stringify({ status: r.status, text: t }));
  } catch (e) { process.stdout.write(JSON.stringify({ status: 0, text: String(e) })); }
});"""


def api(method, path, body=None):
    q = json.dumps({'key': E['N8N_API_KEY'], 'method': method, 'path': path, 'body': body})
    out = subprocess.run(['docker', 'exec', '-i', 'infra-n8n-1', 'node', '-e', _NODE_CALL],
                         input=q, capture_output=True, text=True, timeout=180)
    if out.returncode != 0:
        return 0, out.stderr[:500]
    r = json.loads(out.stdout)
    try: return r['status'], json.loads(r['text'] or 'null')
    except Exception: return r['status'], r['text'][:500]


def sql(q):
    return subprocess.run(['docker', 'exec', '-i', 'infra-postgres-1', 'psql', '-U', E['N8N_DB_USER'], '-d', E['N8N_DB_NAME'],
                           '-At', '-c', q], capture_output=True, text=True, check=True).stdout.strip()


def load(f):
    d = json.load(open(f, encoding='utf-8'))
    return d[0] if isinstance(d, list) else d


def state(wid):
    row = sql(f"""select active, coalesce("activeVersionId",'NULL'), "versionId" from workflow_entity where id='{wid}'""")
    hooks = sql(f"""select "webhookPath" from webhook_entity where "workflowId"='{wid}' order by 1""")
    return row, hooks.split('\n') if hooks else []


def guard(args):
    if args.id in PRODUCTION_IDS and not args.production:
        sys.exit(f'REFUSED: {args.id} is a production workflow; pass --production to deploy it')


def cmd_deploy(args):
    guard(args)
    f = load(args.file)
    if f.get('id') not in (None, args.id):
        sys.exit(f'REFUSED: the file is workflow {f.get("id")}, not {args.id}')
    before = state(args.id)
    body = {'name': f['name'], 'nodes': f['nodes'], 'connections': f['connections'], 'settings': f.get('settings') or {}}
    t0 = time.time()
    previous = before[0].split('|')[1]
    code, resp = api('PUT', f'/workflows/{args.id}', body)
    print(f'PUT /workflows/{args.id} -> HTTP {code} in {time.time() - t0:.1f}s')
    print('  before:', before); print('  after: ', state(args.id))
    if code == 200:
        sys.exit(0)
    print('  error:', json.dumps(resp)[:600])
    if previous == 'NULL':
        sys.exit('DEPLOY FAILED and there was no active version to roll back to')
    rc, rresp = api('POST', f'/workflows/{args.id}/activate', {'versionId': previous})
    print(f'ROLLED BACK: activate {previous[:8]} -> HTTP {rc}' + ('' if rc == 200 else f'  error: {json.dumps(rresp)[:400]}'))
    print('  now:   ', state(args.id))
    sys.exit(2 if rc == 200 else 3)   # 2 = failed and rolled back; 3 = failed AND the rollback failed


def cmd_activate(args):
    guard(args)
    before = state(args.id)
    code, resp = api('POST', f'/workflows/{args.id}/activate', {'versionId': args.version})
    print(f'POST /workflows/{args.id}/activate versionId={args.version[:8]} -> HTTP {code}')
    if code != 200: print('  error:', json.dumps(resp)[:600])
    print('  before:', before); print('  after: ', state(args.id))
    sys.exit(0 if code == 200 else 1)


def signed_probe(path):
    phone = '+35190' + str(int(time.time()) % 10000000).zfill(7)
    p = {'AccountSid': E['TWILIO_ACCOUNT_SID'], 'MessageSid': 'SMdeploy' + uuid.uuid4().hex[:24],
         'From': 'whatsapp:' + phone, 'To': 'whatsapp:' + GATE_NUMBER, 'Body': 'Hello',
         'NumMedia': '0', 'ProfileName': 'Deploy probe', 'WaId': phone.lstrip('+')}
    p['SmsMessageSid'] = p['MessageSid']
    base = PUBLIC_URL + ''.join(k + p[k] for k in sorted(p))
    sig = base64.b64encode(hmac.new(E['TWILIO_AUTH_TOKEN'].encode(), base.encode(), hashlib.sha1).digest()).decode()
    since = time.strftime('%Y-%m-%d %H:%M:%S+00', time.gmtime(time.time() - 1))
    req = urllib.request.Request(BASE + '/webhook/' + path, data=urllib.parse.urlencode(p).encode(), method='POST',
                                 headers={'X-Twilio-Signature': sig, 'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        with urllib.request.urlopen(req, timeout=90) as r: code = r.status
    except urllib.error.HTTPError as e: code = e.code
    return code, since


def cmd_verify(args):
    if args.signed_probe and args.id in PRODUCTION_IDS:
        sys.exit('REFUSED: a signed probe on production makes the real workflow send a real message')
    f = load(args.file)
    active, av, _ = state(args.id)[0].split('|')
    hooks = state(args.id)[1]
    rows_for_path = sql(f"""select count(*) from webhook_entity where "webhookPath"='{args.path}'""")
    unsigned = subprocess.run(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'POST', '--max-time', '10',
                               BASE + '/webhook/' + args.path], capture_output=True, text=True).stdout
    served = json.loads(sql(f"""select nodes from workflow_history where "versionId"='{av}'""") or '[]') if av != 'NULL' else []
    sconn = json.loads(sql(f"""select connections from workflow_history where "versionId"='{av}'""") or '{}') if av != 'NULL' else {}
    key = lambda n: json.dumps(n, sort_keys=True)          # EVERY field of the node
    fs = {n['name']: key(n) for n in f['nodes']}; ss = {n['name']: key(n) for n in served}
    diff = sorted(set(fs) ^ set(ss)) + [k for k in fs if k in ss and fs[k] != ss[k]]
    checks = [('activeVersionId set', av != 'NULL', av),
              (f'exactly one webhook row for /{args.path}, owned by {args.id}', rows_for_path == '1' and hooks == [args.path], f'{rows_for_path} row(s); workflow owns {hooks}'),
              ('unsigned POST returns 403', unsigned == '403', unsigned),
              ('served version == file, every field of every node, and the connections',
               av != 'NULL' and len(ss) == len(fs) and not diff and sconn == f['connections'],
               f'{len(ss)} served / {len(fs)} file; differing ({len(diff)}): {diff}; connections equal: {sconn == f["connections"]}')]
    if args.signed_probe:
        code, since = signed_probe(args.path)
        ex = ''
        for _ in range(30):
            ex = sql(f"""select id||'|'||coalesce("workflowVersionId",'NULL')||'|'||status from execution_entity
                         where "workflowId"='{args.id}' and "startedAt" >= '{since}' order by id limit 1""")
            if ex: break
            time.sleep(2)
        exid, exv, exst = (ex.split('|') + ['', '', ''])[:3]
        # What RAN, not what the row says. execution_entity.workflowVersionId records the
        # workflow's current DRAFT id, not the version served (measured 21 Sep 2026: after
        # a rejected PUT and a rollback, it named the rejected draft while all 38 Code
        # nodes that ran were the active version's). So compare the executed snapshot.
        ran_ok, ran_detail = False, 'no snapshot'
        if exid:
            wd = json.loads(sql(f"""select "workflowData" from execution_data where "executionId"={int(exid)}""") or '{}')
            ran = {n['name']: n for n in wd.get('nodes', [])}
            code_nodes = [n for n in f['nodes'] if (n.get('parameters') or {}).get('jsCode')]
            same = sum((ran.get(n['name'], {}).get('parameters') or {}).get('jsCode') == n['parameters']['jsCode'] for n in code_nodes)
            hook = next((n for n in f['nodes'] if n['type'] == 'n8n-nodes-base.webhook'), None)
            hook_ok = hook is None or (ran.get(hook['name'], {}).get('parameters') or {}).get('path') == hook['parameters'].get('path')
            ran_ok = same == len(code_nodes) and hook_ok
            ran_detail = f'{same}/{len(code_nodes)} Code nodes and the webhook path match the file'
        checks.append(('a SIGNED request executes the FILE\'s code', code == 200 and exst == 'success' and ran_ok,
                       f'HTTP {code}; execution {exid or "none"} ({exst or "-"}); {ran_detail}; row says {exv[:8] if exv else "-"}, served {av[:8]}'))
    for n, ok, d in checks: print(f"{'PASS' if ok else 'FAIL'}  {n}  ({d})")
    ok = all(c[1] for c in checks)
    print('ALL PASS' if ok else 'SOME FAILED')
    sys.exit(0 if ok else 1)


def cmd_state(args):
    print(state(args.id))


ap = argparse.ArgumentParser()
sub = ap.add_subparsers(dest='cmd', required=True)
for name in ('deploy', 'activate', 'verify', 'state'):
    s = sub.add_parser(name)
    s.add_argument('--id', required=True)
    s.add_argument('--production', action='store_true')
    if name in ('deploy', 'verify'): s.add_argument('--file', required=True)
    if name == 'activate': s.add_argument('--version', required=True)
    if name == 'verify':
        s.add_argument('--path', required=True)
        s.add_argument('--signed-probe', action='store_true')
args = ap.parse_args()
{'deploy': cmd_deploy, 'activate': cmd_activate, 'verify': cmd_verify, 'state': cmd_state}[args.cmd](args)
