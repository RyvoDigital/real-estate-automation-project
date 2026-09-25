#!/usr/bin/env python3
"""The handoff card on the paths the 20-run gate does not walk. Run ON THE SERVER,
against the gate copy, after tests/gate_run.py (same gate client, same signing).

  python3 tests/gate_card_paths.py               # the media path, on the CLEAN gate copy
  python3 tests/gate_card_paths.py --sabotage    # + the internal path and the fallback,
                                                 #   on tests/sabotage_card.py's copy

  media     two voice notes from a fresh lead: the second hands them over, and the operator
            must get the card (Motivo "enviou de novo uma mensagem de voz ...")
  internal  (--sabotage) ParseClaude throws: the lead gets the handoff note and the operator
            the card, read from n8n's own execution data, because on this path the run row
            is written before the card
  fallback  (--sabotage) BuildOperatorAlert throws: NotifyOperator must still send, and what
            it sent must be the OLD three-line alert; the run row says sent_as 'legacy' and
            an operator_card.fell_back event exists

What was sent is read from each Notify node's recorded output: the sink answers as Twilio
does, with the message's `body` and `to` (tests/gate_sink.workflow.json), never from a
status. PASS = every scenario OK.
"""
import argparse, base64, hashlib, hmac, json, subprocess, time, urllib.parse, urllib.request, uuid

ap = argparse.ArgumentParser()
ap.add_argument('--sabotage', action='store_true')
ap.add_argument('--env', default='/opt/ryvo-automation-platform/.env')
ap.add_argument('--gate-path', default='twilio-inbound-gate-5e1d8c47')
args = ap.parse_args()

E = {}
for l in open(args.env):
    l = l.strip()
    if l and not l.startswith('#') and '=' in l:
        k, v = l.split('=', 1); E[k] = v
PUBLIC_URL = 'https://n8n.ryvodigital.com/webhook/twilio-inbound'      # VerifySignature's constant
POST_URL = 'https://n8n.ryvodigital.com/webhook/' + args.gate_path
GATE_NUMBER = '+351900009000'
DB = E['SUPABASE_URL'].rstrip('/') + '/rest/v1/'
H = {'apikey': E['SUPABASE_SERVICE_ROLE_KEY'], 'Authorization': 'Bearer ' + E['SUPABASE_SERVICE_ROLE_KEY'],
     'Content-Type': 'application/json', 'Prefer': 'return=representation'}
q = urllib.parse.quote

def db(method, path, body=None):
    req = urllib.request.Request(DB + path, method=method, headers=H,
                                 data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b'null')

def send(phone, text, media=None):
    p = {'AccountSid': E['TWILIO_ACCOUNT_SID'], 'MessageSid': 'SMgate' + uuid.uuid4().hex[:26],
         'From': 'whatsapp:' + phone, 'To': 'whatsapp:' + GATE_NUMBER, 'Body': text,
         'NumMedia': '1' if media else '0', 'ProfileName': 'Gate', 'WaId': phone.lstrip('+')}
    if media:
        p['MediaContentType0'] = media
        p['MediaUrl0'] = 'https://api.twilio.com/gate/' + uuid.uuid4().hex
    p['SmsMessageSid'] = p['MessageSid']
    base = PUBLIC_URL + ''.join(k + p[k] for k in sorted(p))
    sig = base64.b64encode(hmac.new(E['TWILIO_AUTH_TOKEN'].encode(), base.encode('utf-8'), hashlib.sha1).digest()).decode()
    req = urllib.request.Request(POST_URL, data=urllib.parse.urlencode(p).encode(), method='POST',
                                 headers={'X-Twilio-Signature': sig, 'Content-Type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status

def runs_since(ca, since, want, timeout=180):
    t0 = time.time()
    while time.time() - t0 < timeout:
        rows = db('GET', f'automation_runs?select=started_at,status,error_type,payload&client_automation_id=eq.{ca}'
                         f'&started_at=gte.{q(since)}&order=started_at.asc')
        if len(rows) >= want: return rows
        time.sleep(3)
    return rows

# ---- n8n's own execution data, read-only (the same reader as gate_run.py) ----------------
def n8n_sql(sql):
    cmd = ['docker', 'compose', '--env-file', '../.env', 'exec', '-T', 'postgres', 'psql', '-U', E['N8N_DB_USER'],
           '-d', E['N8N_DB_NAME'], '-At', '-c', 'begin read only;', '-c', sql, '-c', 'rollback;']
    out = subprocess.run(cmd, cwd='/opt/ryvo-automation-platform/infra', capture_output=True, text=True, check=True).stdout
    return [l for l in out.split('\n') if l and l not in ('BEGIN', 'ROLLBACK')]

def flatted(txt):
    arr = json.loads(txt); memo = {}
    def rv(i):
        if i in memo: return memo[i]
        t = arr[i]
        if isinstance(t, dict):
            o = {}; memo[i] = o
            for k, v in t.items(): o[k] = rv(int(v)) if isinstance(v, str) and v.isdigit() else v
            return o
        if isinstance(t, list):
            o = []; memo[i] = o
            for v in t: o.append(rv(int(v)) if isinstance(v, str) and v.isdigit() else v)
            return o
        return t
    return rv(0)

def node_outputs(since, node):
    """Every item `node` emitted, on any output, in gate executions started since `since`."""
    out = []
    ids = n8n_sql("select e.id from execution_entity e where e.\"workflowId\"='ryvoInboundConcGATE' "
                  f"and e.\"startedAt\" >= '{since}' order by e.id")
    for ex in ids:
        rows = n8n_sql(f'select data from execution_data where "executionId"={int(ex)}')
        if not rows: continue
        runs = (flatted(rows[0]).get('resultData') or {}).get('runData') or {}
        for r in runs.get(node) or []:
            for branch in ((r.get('data') or {}).get('main') or []):
                for item in branch or []:
                    out.append(item.get('json', {}))
    return out

def posted_body(item):
    """The WhatsApp body a Notify node sent, from the sink's Twilio-shaped response
    (tests/gate_sink.workflow.json echoes `body` and `to`, as Twilio does)."""
    def find(o):
        if isinstance(o, dict):
            if isinstance(o.get('body'), str) and 'sid' in o and 'to' in o: return o['body']
            for v in o.values():
                r = find(v)
                if r is not None: return r
        if isinstance(o, list):
            for v in o:
                r = find(v)
                if r is not None: return r
        return None
    return find(item)

def card_fields(p):
    return {x.get('key'): x.get('value') for x in (((p.get('operator_alert') or {}).get('card') or {}).get('fields') or [])}

# ---- setup ---------------------------------------------------------------------------------
client = db('GET', 'clients?select=id,rehearsal&whatsapp_number=eq.' + q(GATE_NUMBER))
assert client and client[0]['rehearsal'] is True, 'no rehearsal gate client: run tests/gate_setup.py'
cid = client[0]['id']
ca = db('GET', f'client_automations?select=id,config&client_id=eq.{cid}&automation_id=eq.ebd13145-d1c7-4a29-92e4-9c107560c2ef')[0]
assert (ca['config'] or {}).get('gate_only') is True, 'the client automation is not marked gate_only'
stamp = int(time.time()) % 100000
now = lambda back=1: time.strftime('%Y-%m-%dT%H:%M:%S+00:00', time.gmtime(time.time() - back))
start_iso = now(0)

def fresh_lead(i):
    phone = '+35190' + f'{stamp:05d}{90 + i:02d}'
    db('POST', 'leads', {'client_id': cid, 'phone': phone, 'full_name': 'João', 'stage': 'qualified',
                         'lead_type': 'buyer', 'area': 'Cascais', 'source': 'gate',
                         'qualification': {'name_source': 'stated', 'bedrooms': 3, 'gate_run': stamp}})
    return phone

results = {}

# ---- media ---------------------------------------------------------------------------------
phone = fresh_lead(1)
bad = []
send(phone, '', media='audio/ogg'); time.sleep(8)
since = now()
send(phone, '', media='audio/ogg')
rows = runs_since(ca['id'], since, 1)
p = (rows[-1] if rows else {}).get('payload') or {}
oa, f = p.get('operator_alert') or {}, card_fields(p)
if not p.get('escalated'): bad.append(f'the second voice note did not hand over (payload {sorted(p)[:8]})')
if oa.get('sent_as') != 'card': bad.append(f'operator sent {oa.get("sent_as")!r} ({oa.get("legacy_reason")})')
if not str(f.get('motivo', '')).startswith('enviou de novo uma mensagem de voz'): bad.append(f'Motivo {f.get("motivo")!r}')
if 'a conversa passa para um colega' not in str(f.get('ja_dito', '')): bad.append(f'Já dito {f.get("ja_dito")!r}')
posted = [posted_body(x) for x in node_outputs(since, 'NotifyOperatorMedia')]
if not any(b and b.startswith('*Passagem para uma pessoa*') for b in posted): bad.append(f'the sink did not receive the card: {posted[:1]}')
results['media'] = bad
print('media    ->', 'OK' if not bad else 'FAIL: ' + '; '.join(bad), flush=True)

if args.sabotage:
    # ---- internal ------------------------------------------------------------------------
    phone = fresh_lead(2)
    bad = []
    since = now()
    send(phone, 'Olá, procuro uma casa em Cascais SABOTAGE-CARD-INTERNAL')
    rows = runs_since(ca['id'], since, 1)
    if not any((r.get('payload') or {}).get('internal_failure') or str(r.get('error_type', '')).startswith('internal_error')
               for r in rows):
        bad.append(f'no internal-failure run row ({[r.get("error_type") for r in rows]})')
    time.sleep(10)
    built = node_outputs(since, 'BuildOperatorAlertInternal')
    if not built or built[-1].get('alertFormat') != 'card' or not built[-1].get('alertTo'):
        bad.append(f'BuildOperatorAlertInternal: {[(b.get("alertFormat"), bool(b.get("alertTo")), b.get("alertLegacyReason")) for b in built]}')
    posted = [posted_body(x) for x in node_outputs(since, 'NotifyOperatorInternal')]
    body = next((b for b in posted if b), '') or ''
    if not body.startswith('*Passagem para uma pessoa*'): bad.append(f'the sink did not receive the card: {body[:60]!r}')
    if '*Motivo:* falha técnica interna' not in body: bad.append('card Motivo is not the internal failure')
    if 'um colega entra em contacto em breve' not in body: bad.append('card Já dito does not carry the handoff sent')
    results['internal'] = bad
    print('internal ->', 'OK' if not bad else 'FAIL: ' + '; '.join(bad), flush=True)

    # ---- fallback --------------------------------------------------------------------------
    phone = fresh_lead(3)
    bad = []
    since = now()
    send(phone, 'Talk to a human please (SABOTAGE-CARD-BUILD)')
    rows = runs_since(ca['id'], since, 1)
    esc = [r for r in rows if (r.get('payload') or {}).get('escalated')]
    p = (esc[-1] if esc else {}).get('payload') or {}
    oa = p.get('operator_alert') or {}
    if not esc: bad.append('did not escalate: the fallback was not exercised')
    elif oa.get('sent_as') != 'legacy': bad.append(f'run row says sent_as {oa.get("sent_as")!r}, not legacy')
    elif p.get('operator_notified') is not True: bad.append('operator NOT notified: the fallback did not send')
    time.sleep(5)
    built = node_outputs(since, 'BuildOperatorAlert')
    # n8n records the throw on the node's ERROR output as {"error": "<message> [line N]"},
    # and takes "SABOTAGE-CARD-BUILD:" as the error's NAME, dropping it from the message.
    if not any('deliberate, for the live proof' in str(b.get('error', '')) for b in built):
        bad.append('the sabotage did not apply (BuildOperatorAlert did not throw)')
    posted = [posted_body(x) for x in node_outputs(since, 'NotifyOperator')]
    body = next((b for b in posted if b), '') or ''
    if not body.startswith('Ryvo escalation\n') or '\nReason: needs_human' not in body or '\nLast msg: "' not in body:
        bad.append(f'the sink did not receive the old three-line alert: {body[:80]!r}')
    fell = db('GET', f'events?select=type&client_id=eq.{cid}&type=eq.operator_card.fell_back&created_at=gte.{q(since)}')
    if not fell: bad.append('no operator_card.fell_back event')
    results['fallback'] = bad
    print('fallback ->', 'OK' if not bad else 'FAIL: ' + '; '.join(bad), flush=True)

# Leave nothing escalated in the cockpit (the same cleanup the gate uses).
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from gate_cleanup import clear_gate_escalations
import os as _gro, sys as _grs
_grs.path.insert(0, _gro.path.join(_gro.path.dirname(_gro.path.dirname(_gro.path.abspath(__file__))), 'infra', 'scripts'))
import gate_record
cleared, not_cleared = clear_gate_escalations(db, cid)
print(f'gate escalations cleared: {cleared}' + (f', NOT cleared: {not_cleared}' if not_cleared else ''))
ok = all(not v for v in results.values()) and not not_cleared
print('PASS' if ok else 'FAIL')
# The gate record (infra/scripts/gate_record.py, 25 Sep 2026): this verdict, bound to the
# gated source only if the gate served is the verified build. A deploy reads it.
try:
    gate_record.record('gate_card_paths', 'PASS' if ok else 'FAIL', {'sabotage': bool(args.sabotage)}, E)
except Exception as _e:
    print('gate record NOT written:', _e)

