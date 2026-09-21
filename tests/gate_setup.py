#!/usr/bin/env python3
"""ONE-TIME setup of the deploy gate's client (CLAUDE.md, "The Concierge deploy gate").
Run ON THE SERVER, from /opt/ryvo-automation-platform, with the operator's go:

  python3 tests/gate_setup.py --calendar-id <a DEDICATED TEST calendar id>

Creates, if absent (idempotent: a second run changes nothing and says so):
  * clients:            'ZZ GATE — deploy gate (never a real client)', rehearsal = true,
                        whatsapp_number +351900009000 (routes the gate copy's inbound to it)
  * client_automations: inbound_concierge, config COPIED from the Ryvo Test Client's, with:
      calendar_id   -> the dedicated test calendar (never a real one: a booking the model
                       ever writes lands somewhere harmless)
      escalate_to   -> +351900009999 (the operator notification goes to the sink anyway)
      agency_name   -> 'ZZ GATE'
      listing_ingest.agent_numbers -> [] (a gate lead must never route to listing ingest)
      gate_only     -> true (a marker for humans and for the health check; nothing reads it)
Leads are NOT created here: tests/gate_run.py seeds one fresh, pre-qualified lead per run.

Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env. Prints ids, never keys.
"""
import argparse, json, sys, urllib.request, urllib.parse

GATE_CLIENT_NAME = 'ZZ GATE — deploy gate (never a real client)'
GATE_NUMBER = '+351900009000'
SOURCE_CLIENT = 'Ryvo Test Client'
CONCIERGE_AUTOMATION_ID = 'ebd13145-d1c7-4a29-92e4-9c107560c2ef'

ap = argparse.ArgumentParser()
ap.add_argument('--calendar-id', required=True)
ap.add_argument('--env', default='/opt/ryvo-automation-platform/.env')
args = ap.parse_args()

E = {}
for l in open(args.env):
    l = l.strip()
    if l and not l.startswith('#') and '=' in l:
        k, v = l.split('=', 1); E[k] = v
BASE = E['SUPABASE_URL'].rstrip('/') + '/rest/v1/'
H = {'apikey': E['SUPABASE_SERVICE_ROLE_KEY'], 'Authorization': 'Bearer ' + E['SUPABASE_SERVICE_ROLE_KEY'],
     'Content-Type': 'application/json', 'Prefer': 'return=representation'}

def rq(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, headers=H,
                                 data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b'null')

q = urllib.parse.quote
existing = rq('GET', 'clients?select=id,name,rehearsal&whatsapp_number=eq.' + q(GATE_NUMBER))
if existing:
    c = existing[0]
    cas = rq('GET', f'client_automations?select=id&client_id=eq.{c["id"]}&automation_id=eq.{CONCIERGE_AUTOMATION_ID}')
    print(f'ALREADY SET UP, nothing changed: client {c["id"]} (rehearsal={c["rehearsal"]}), client_automation {cas[0]["id"] if cas else "MISSING"}')
    sys.exit(0 if cas else 1)

src = rq('GET', 'clients?select=id,timezone,locale&name=eq.' + q(SOURCE_CLIENT))[0]
src_ca = rq('GET', f'client_automations?select=config&client_id=eq.{src["id"]}&automation_id=eq.{CONCIERGE_AUTOMATION_ID}')[0]
cfg = dict(src_ca['config'])
cfg['calendar_id'] = args.calendar_id
cfg['escalate_to'] = '+351900009999'
cfg['agency_name'] = 'ZZ GATE'
li = dict(cfg.get('listing_ingest') or {}); li['agent_numbers'] = []; cfg['listing_ingest'] = li
cfg['gate_only'] = True

client = rq('POST', 'clients', {'name': GATE_CLIENT_NAME, 'whatsapp_number': GATE_NUMBER, 'rehearsal': True,
                                'status': 'active', 'timezone': src['timezone'], 'locale': src['locale']})[0]
ca = rq('POST', 'client_automations', {'client_id': client['id'], 'automation_id': CONCIERGE_AUTOMATION_ID,
                                        'enabled': True, 'config': cfg})[0]
print(f'CREATED client {client["id"]} (rehearsal={client["rehearsal"]}, number {GATE_NUMBER})')
print(f'CREATED client_automation {ca["id"]} (calendar {args.calendar_id})')
print(f'For the health check: GATE_CLIENT_AUTOMATION_ID={ca["id"]}')
