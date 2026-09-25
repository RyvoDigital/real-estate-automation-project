#!/usr/bin/env python3
"""Build the GATE COPY of the Concierge from the exact build to be deployed, and PROVE
it differs only where it is allowed to (CLAUDE.md, "The Concierge deploy gate").

  python3 tests/build_gate.py [path/to/build.json]
  -> tests/ryvoInboundConc01.GATE.json (gitignored), and the node-by-node diff on stdout

The gate copy may differ from the build ONLY in (operator, 21 Sep 2026):
  * the workflow id and name
  * the webhook path (and its webhookId, which n8n keys the webhook on)
  * every OUTBOUND channel pointed at the sink: all 8 Twilio sends, all 4 Resend
    emails, the cockpit listing post. Nothing from a gate run may reach a phone or inbox.
  * settings.errorWorkflow removed: the error workflow is itself an outbound channel
    (it alerts), and a gate run must not page anybody.
  * version metadata (versionId, activeVersionId, ...), which n8n assigns on import.
The gate CLIENT's ids never appear in the workflow: it routes by the `To` number, so a
gate client with its own number needs no code difference at all.

Anything else that differs is a FAILURE here, before the gate runs: otherwise the gate
tests a different build from the one we ship.
"""
import json, os, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, 'workflows', 'ryvoInboundConc01.json')
OUT = os.path.join(REPO, 'tests', 'ryvoInboundConc01.GATE.json')

GATE_ID = 'ryvoInboundConcGATE'
GATE_NAME = 'inbound_concierge_GATE (deploy gate, never live traffic)'
GATE_PATH = 'twilio-inbound-gate-5e1d8c47'
GATE_WEBHOOK_ID = 'ryvo-twilio-inbound-gate-hook'
SINK_URL = 'http://localhost:5678/webhook/gate-sink-9b2f6a31'   # tests/gate_sink.workflow.json

SINK_NODES = [
    # Twilio: every WhatsApp the workflow can send
    'SendWhatsApp', 'SendHandoffNote', 'NotifyOperator', 'SendMediaReply', 'ReplyToAgent',
    'SendInternalHandoff', 'AlertInvariant', 'AlertDelivery',
    # the handoff card and its plain-alert retries, on all three paths (24 Sep 2026)
    'NotifyOperatorPlain', 'NotifyOperatorMedia', 'NotifyOperatorMediaPlain',
    'NotifyOperatorInternal', 'NotifyOperatorInternalPlain',
    # Resend: every email
    'EmailNotifyFailure', 'EmailMediaEscalation', 'EmailDbOutage', 'EmailInternalFailure',
    # the cockpit
    'PostListing',
]
VERSION_KEYS = ['versionId', 'activeVersionId', 'versionCounter', 'updatedAt', 'createdAt', 'shared', 'pinData', 'active', 'isArchived']

build = json.load(open(BUILD, encoding='utf-8'))
build = build[0] if isinstance(build, list) else build
gate = json.loads(json.dumps(build))

gate['id'] = GATE_ID
gate['name'] = GATE_NAME
for k in VERSION_KEYS: gate.pop(k, None)
gate['active'] = False
gate['settings'] = {k: v for k, v in (gate.get('settings') or {}).items() if k != 'errorWorkflow'}

by = {n['name']: n for n in gate['nodes']}
by['Webhook']['parameters']['path'] = GATE_PATH
by['Webhook']['webhookId'] = GATE_WEBHOOK_ID
for name in SINK_NODES:
    assert name in by, f'outbound node {name} is not in the build: the sink list is stale'
    by[name]['parameters']['url'] = SINK_URL

# 🔴 Every HTTP node that is NOT Supabase, the model or the calendar must be on the sink
# list. A new outbound node added to the build without being listed here fails the gate
# build instead of quietly sending from a gate run.
REAL_OK = ('/rest/v1/', 'api.anthropic.com', 'googleapis.com/calendar')
for n in gate['nodes']:
    if n['type'].endswith('httpRequest') and n['name'] not in SINK_NODES:
        url = str(n['parameters'].get('url', ''))
        assert any(r in url for r in REAL_OK), f'UNLISTED OUTBOUND NODE {n["name"]}: {url[:90]}'

# ---- the proof: node by node, every difference, and each one must be allowed ----------
def flat(o, pre=''):
    out = {}
    if isinstance(o, dict):
        for k, v in o.items(): out.update(flat(v, f'{pre}.{k}' if pre else k))
    elif isinstance(o, list):
        for i, v in enumerate(o): out.update(flat(v, f'{pre}[{i}]'))
    else:
        out[pre] = o
    return out

bn = {n['name']: n for n in build['nodes']}
gn = {n['name']: n for n in gate['nodes']}
diffs, bad = [], []
if set(bn) != set(gn): bad.append(f'node set differs: {sorted(set(bn) ^ set(gn))}')
for name in sorted(bn):
    a, b = flat(bn[name]), flat(gn.get(name, {}))
    for k in sorted(set(a) | set(b)):
        if a.get(k) != b.get(k):
            d = f'node {name}: {k}: {str(a.get(k))[:70]!r} -> {str(b.get(k))[:70]!r}'
            allowed = (name in SINK_NODES and k == 'parameters.url') or \
                      (name == 'Webhook' and k in ('parameters.path', 'webhookId'))
            (diffs if allowed else bad).append(d)
if json.dumps(build['connections'], sort_keys=True) != json.dumps(gate['connections'], sort_keys=True):
    bad.append('connections differ')
top = sorted((set(build) | set(gate)) - {'nodes', 'connections'})
for k in top:
    if build.get(k) != gate.get(k):
        d = f'workflow {k}: {str(build.get(k))[:60]!r} -> {str(gate.get(k))[:60]!r}'
        allowed = k in ('id', 'name', 'settings') or k in VERSION_KEYS
        if k == 'settings':
            s1 = {x: y for x, y in (build.get('settings') or {}).items() if x != 'errorWorkflow'}
            allowed = s1 == gate.get('settings')
        (diffs if allowed else bad).append(d)

print(f'build: {BUILD}\n  versionId {build.get("versionId")}\n')
print(f'ALLOWED DIFFERENCES ({len(diffs)}):')
for d in diffs: print('  ' + d)
if bad:
    print(f'\n🔴 DISALLOWED DIFFERENCES ({len(bad)}): the gate would test a different build. NOT WRITTEN.')
    for d in bad: print('  ' + d)
    sys.exit(1)
json.dump(gate, open(OUT, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
print(f'\nno other difference: {len(bn)} nodes, connections identical.\nwrote {OUT}')
# The gate record (infra/scripts/gate_record.py, 25 Sep 2026): this gate copy was built
# from BUILD. `n8n_api_deploy.py verify` on the gate id stamps it once it is served.
import sys as _grs
_grs.path.insert(0, os.path.join(REPO, 'infra', 'scripts'))
import gate_record
try:
    b = gate_record.write_build(BUILD, OUT, REPO)
    print(f"gate record: build from {b['source']} md5 {b['source_md5'][:8]} at {(b['source_commit'] or '?')[:7]}"
          + ('' if b['source_committed'] else '  (UNCOMMITTED changes: a deploy will refuse this build)'))
except Exception as e:
    print('gate record NOT written (not on the server?):', e)
