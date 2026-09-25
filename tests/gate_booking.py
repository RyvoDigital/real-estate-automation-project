#!/usr/bin/env python3
"""THE BOOKING PATH, END TO END, ON THE GATE COPY (never production).

  python3 tests/gate_booking.py --runs 10 [--out /tmp/gate_booking.json]

Run ON THE SERVER, with the gate copy (ryvoInboundConcGATE) and the sink
published, and the gate calendar reachable through n8n's own credential
(tests/gate_calendar_list.workflow.json, run with `n8n execute`).

Each run is two fresh gate leads in one language (en, pt, es in turn):
  1. A asks to visit, and is offered slots; B asks too, and is offered slots —
     both offers are taken BEFORE either books, so both contain the slot S;
  2. A picks S, naming its weekday and time           expect: booked
  3. B picks the same S                              expect: NOT booked. Sequentially the
     workflow already sees S busy and declines at the intent (booking_intent 'taken',
     booking_result 'not_attempted'); the re-check before create (slot_taken) is only
     reachable when both confirm at once: --race (corrected 22 Sep 2026)
Proved per run (operator, 22 Sep 2026):
  - A: booking_result 'created'; the event exists in the GATE calendar with the
    run's event id, starting at S's exact instant (Lisbon time as offered);
    viewing.booked written; the confirmation names S's time, in A's language;
  - B: not booked (by the intent check, or by the re-check in a race); no second
    event at S; the reply in B's language.
  - ZERO invariant alerts, counted by THIS script from events (invariant.violated)
    for every run, not read off the payloads: on 21 Sep two critical alerts fired
    in ten runs and the per-run checks, which read payloads, missed both (22 Sep 2026);
  - escalations: none sequentially; in a race exactly the loser, as a lost race
    (booking_lost_race, a person reason), with the run NOT an error.
The sink swallows every outbound call. Only the gate calendar is written, and
tests/gate_calendar_clear.workflow.json empties it afterwards.
"""
import argparse, base64, datetime, hashlib, hmac, json, subprocess, sys, threading, time, urllib.parse, urllib.request, uuid

ap = argparse.ArgumentParser()
ap.add_argument('--runs', type=int, default=10)
ap.add_argument('--env', default='/opt/ryvo-automation-platform/.env')
ap.add_argument('--gate-path', default='twilio-inbound-gate-5e1d8c47')
ap.add_argument('--out', default='/tmp/gate_booking.json')
ap.add_argument('--race', action='store_true', help='A and B confirm the same slot at the same instant: the re-check (RecheckFreeBusy) is the only thing between them')
ap.add_argument('--lost-slot-src', default=__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.dirname(__import__('os').path.abspath(__file__))), 'src', 'lost_slot.js'),
                help="the BUILD's src/lost_slot.js: the lost-slot sentences are read from it, never copied")
ap.add_argument('--parse-reply-src', default=__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.dirname(__import__('os').path.abspath(__file__))), 'src', 'parse_reply.js'),
                help="the BUILD's src/parse_reply.js: its replyLooksBroken() reads every delivered message")
args = ap.parse_args()

# 22 Sep 2026: the delivered-message scan and the gate cleanup (Defect D; gate leads
# crowding the cockpit). Modules next to this script; the detector is the BUILD's.
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from gate_delivered import delivered_broken
from gate_cleanup import clear_gate_escalations
import os as _gro, sys as _grs
_grs.path.insert(0, _gro.path.join(_gro.path.dirname(_gro.path.dirname(_gro.path.abspath(__file__))), 'infra', 'scripts'))
import gate_record

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
    req = urllib.request.Request(DB + path, method=method, headers=H, data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b'null')


LAST_SID = {}   # phone -> the MessageSid of the last inbound this script sent for it


def send(phone, text):
    p = {'AccountSid': E['TWILIO_ACCOUNT_SID'], 'MessageSid': 'SMbook' + uuid.uuid4().hex[:26],
         'From': 'whatsapp:' + phone, 'To': 'whatsapp:' + GATE_NUMBER, 'Body': text,
         'NumMedia': '0', 'ProfileName': 'Gate', 'WaId': phone.lstrip('+')}
    p['SmsMessageSid'] = p['MessageSid']
    LAST_SID[phone] = p['MessageSid']
    base = PUBLIC_URL + ''.join(k + p[k] for k in sorted(p))
    sig = base64.b64encode(hmac.new(E['TWILIO_AUTH_TOKEN'].encode(), base.encode('utf-8'), hashlib.sha1).digest()).decode()
    req = urllib.request.Request(POST_URL, data=urllib.parse.urlencode(p).encode(), method='POST',
                                 headers={'X-Twilio-Signature': sig, 'Content-Type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.status


def wait_run(ca, since, timeout=180):
    t0 = time.time()
    while time.time() - t0 < timeout:
        rows = db('GET', f'automation_runs?select=started_at,status,error_type,payload&client_automation_id=eq.{ca}'
                         f'&started_at=gte.{q(since)}&order=started_at.asc&limit=1')
        if rows: return rows[0]
        time.sleep(3)
    return None


def turn(ca, phone, text):
    since = time.strftime('%Y-%m-%dT%H:%M:%S+00:00', time.gmtime(time.time() - 1))
    code = send(phone, text)
    run = wait_run(ca, since)
    return code, run


def calendar_events():
    out = subprocess.run(['docker', 'exec', '-e', 'N8N_RUNNERS_BROKER_PORT=5690', 'infra-n8n-1', 'n8n', 'execute',
                          '--id=ryvoGateCalList01', '--rawOutput'], capture_output=True, text=True, timeout=120).stdout
    d = json.loads(out[out.index('{'):])
    rd = d['data']['resultData']
    if rd.get('error'): raise RuntimeError('calendar list failed: ' + str(rd['error'].get('message')))
    return rd['runData']['Out'][0]['data']['main'][0][0]['json']['events']


# 24 Sep 2026: a lost slot's sentence is the SYSTEM's (src/lost_slot.js). Read from the
# build's own source, so this script cannot hold a stale copy.
_LS = open(args.lost_slot_src, encoding='utf-8').read()
LS_TEXT = {m[0]: {'offer': m[1], 'none_left': m[2], 'second_in_a_row': m[3]} for m in __import__('re').findall(
    r"(en|pt|es): \{\s*offer: '([^']*)',\s*none_left: '([^']*)',\s*second_in_a_row: '([^']*)'", _LS)}
assert set(LS_TEXT) == {'en', 'pt', 'es'}, 'could not read the lost-slot templates from ' + args.lost_slot_src
APOLOGY = __import__('re').compile(r'sorry|apolog|mistake|desculp|lament|engano|disculp|perd[oó]n|equivoc|correct', __import__('re').I)


def lost_slot_check(phone, payload, lang, lost_local, busy_locals, bad, who):
    """The lead who lost a slot was re-offered: the system's sentence, the times from a
    calendar read taken then (never the taken slot, never one the calendar now holds),
    and those times are exactly the offer stored on the row."""
    ls = payload.get('lost_slot') or {}
    if ls.get('outcome') != 'reoffer':
        bad.append(f"{who}: lost slot outcome {ls.get('outcome')!r} ({ls.get('detail')}), expected a re-offer"); return []
    if not (ls.get('fresh_read') or {}).get('ok'): bad.append(f"{who}: re-offer without a fresh calendar read: {ls.get('fresh_read')}")
    reply = last_reply(phone)
    head = LS_TEXT[lang]['offer'].split('{slots}')[0]
    if head not in reply: bad.append(f"{who}: the reply is not the system's sentence: {reply[:90]!r}")
    if APOLOGY.search(reply): bad.append(f"{who}: the reply apologises: {reply[:90]!r}")
    stored = offered(phone)
    offer_locals = [s['local'] for s in stored]
    if (lead_q(phone).get('proposed_slots') or {}).get('source') != 'lost_slot': bad.append(f"{who}: the stored offer is not the re-offer")
    if [utc(x['startUtc']) for x in ls.get('offer') or []] != [utc(x) for x in offer_locals]:
        bad.append(f"{who}: the stored offer differs from the one sent")
    for x in [lost_local] + list(busy_locals):
        if any(utc(o) == utc(x) for o in offer_locals): bad.append(f"{who}: re-offered {x}, which the calendar holds")
    for o in stored:
        hh_ = datetime.datetime.fromisoformat(o['local']).strftime('%H:%M')
        if hh_ not in reply: bad.append(f"{who}: the reply does not name the stored {hh_}")
    return stored


def lead_q(phone):
    return db('GET', f'leads?select=qualification&client_id=eq.{cid}&phone=eq.{q(phone)}')[0]['qualification'] or {}


def utc(ts):
    return datetime.datetime.fromisoformat(ts.replace('Z', '+00:00')).astimezone(datetime.timezone.utc)


WEEKDAY = {'en': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
           'pt': ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'],
           'es': ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']}
ASK = {'en': 'Can I come and see it this week?', 'pt': 'Posso ir ver esta semana?', 'es': '¿Puedo ir a verlo esta semana?'}
PICK = {'en': lambda wd, hh: f'{wd} at {hh} please', 'pt': lambda wd, hh: f'{wd} às {hh}, por favor', 'es': lambda wd, hh: f'El {wd} a las {hh}, por favor'}

client = db('GET', 'clients?select=id,rehearsal&whatsapp_number=eq.' + q(GATE_NUMBER))
assert client and client[0]['rehearsal'] is True, 'no gate client, or it is not a rehearsal'
cid = client[0]['id']
ca = db('GET', f'client_automations?select=id,config&client_id=eq.{cid}&automation_id=eq.ebd13145-d1c7-4a29-92e4-9c107560c2ef')[0]
assert (ca['config'] or {}).get('gate_only') is True, 'the client automation is not marked gate_only'
assert 'c_d465470e9dc79fb87c089612c3b8b1c83928e9fb7e5fc715cde5b4d70bdb4177' in json.dumps(ca['config']), 'the gate automation is not on the gate calendar'

stamp = int(time.time()) % 100000
start_iso = time.strftime('%Y-%m-%dT%H:%M:%S+00:00', time.gmtime())
results = []


def new_lead(phone):
    db('POST', 'leads', {'client_id': cid, 'phone': phone, 'full_name': 'João', 'stage': 'qualified', 'lead_type': 'buyer',
                         'area': 'Cascais', 'source': 'gate', 'qualification': {'name_source': 'stated', 'bedrooms': 3, 'gate_run': stamp}})


def offered(phone):
    lead = db('GET', f'leads?select=qualification&client_id=eq.{cid}&phone=eq.{q(phone)}')[0]
    return [s for s in (((lead['qualification'] or {}).get('proposed_slots') or {}).get('slots') or []) if s.get('local')]


def last_reply(phone):
    lead = db('GET', f'leads?select=id&client_id=eq.{cid}&phone=eq.{q(phone)}')[0]
    rows = db('GET', f'messages?select=body,created_at&lead_id=eq.{lead["id"]}&direction=eq.outbound&order=created_at.desc&limit=1')
    return rows[0]['body'] if rows else ''


def lead_id(phone):
    return db('GET', f'leads?select=id&client_id=eq.{cid}&phone=eq.{q(phone)}')[0]['id']


def outbound_after(lid, inbound_sid):
    # What the lead was sent AFTER the given inbound, both read from the database.
    # 🔒 22 Sep 2026: never against this machine's clock. A few seconds of skew between
    # the server and the database put the slot offer that preceded the pick inside the
    # window, and race 2 reported the winner as sent ['ai', 'ai'] when it was sent one.
    rows = db('GET', f'messages?select=created_at&lead_id=eq.{lid}&direction=eq.inbound&external_id=eq.{q(inbound_sid)}')
    if not rows: return []
    return db('GET', f'messages?select=origin,external_id,created_at&lead_id=eq.{lid}&direction=eq.outbound'
                     f'&created_at=gt.{q(rows[0]["created_at"])}&order=created_at.asc')


def events_since(etype, since):
    # Narrow columns: the type, when, and whose. Never the summary's text.
    return db('GET', f'events?select=created_at,data&client_id=eq.{cid}&type=eq.{etype}&created_at=gte.{q(since)}'
                     f'&order=created_at.asc')


SETTLE = 25   # seconds after a run's last turn before its alerts are counted: AssertDelivery
              # writes at the very end of a run, and on 21 Sep the alerts landed 7-19s after the turn


for i in range(1, args.runs + 1):
    lang = ['en', 'pt', 'es'][(i - 1) % 3]
    A = '+35191' + f'{stamp:05d}{i:02d}'
    B = '+35192' + f'{stamp:05d}{i:02d}'
    rec = {'run': i, 'lang': lang, 'problems': []}
    bad = rec['problems']
    run_since = time.strftime('%Y-%m-%dT%H:%M:%S+00:00', time.gmtime(time.time() - 1))
    try:
        new_lead(A); new_lead(B)
        turn(ca['id'], A, ASK[lang]); turn(ca['id'], B, ASK[lang])
        oa, ob = offered(A), offered(B)
        common = [s for s in oa if s['local'] in {x['local'] for x in ob}]
        if not common:
            bad.append(f'no slot offered to both (A {len(oa)}, B {len(ob)})')
            results.append(rec); print(f'run {i:2d} {lang} FAIL: {bad}', flush=True); continue
        S = common[0]
        taken_by_c = []
        if args.race:
            # Condition 1 (operator, 24 Sep 2026): the loser's re-offer is read from the
            # calendar at that moment, never taken from the earlier offer. So before the
            # race a THIRD lead books another slot of that earlier offer; the loser's
            # re-offer must not contain it.
            T = next((s_ for s_ in common[1:]), None)
            if T is None:
                bad.append('race: no second common slot to book first'); results.append(rec)
                print(f'run {i:2d} {lang} FAIL: {bad}', flush=True); continue
            Cph = '+35193' + f'{stamp:05d}{i:02d}'
            new_lead(Cph); turn(ca['id'], Cph, ASK[lang])
            if T['local'] not in [s_['local'] for s_ in offered(Cph)]:
                bad.append("race: the third lead was not offered the slot to take first")
            else:
                lt = datetime.datetime.fromisoformat(T['local'])
                _, rc = turn(ca['id'], Cph, PICK[lang](WEEKDAY[lang][lt.weekday()], lt.strftime('%H:%M')))
                if ((rc or {}).get('payload') or {}).get('booking_result') != 'created': bad.append('race: the third lead could not book the slot to take first')
                else: taken_by_c.append(T['local']); rec['extra_booked'] = rec.get('extra_booked', 0) + 1
            rec['taken_first'] = taken_by_c
        local = datetime.datetime.fromisoformat(S['local'])
        hh = local.strftime('%H:%M')
        wd = WEEKDAY[lang][local.weekday()]
        rec['slot'] = S['local']
        if args.race:
            # Both confirm at the same instant. Neither can see the other's booking in its
            # first freeBusy, so the only thing between them is the re-check before create.
            # The threads only SEND. automation_runs has no lead column, so each run is tied to
            # its lead afterwards. 🔒 22 Sep 2026: NOT by the outbound sid alone -- a lost race
            # escalates, and an escalated run's payload carries no twilio_sid (races 1-4 on
            # 21 Sep could each map only one run). A run with a sid maps through the messages
            # row carrying it; the one left over maps to the lead left over, and that is then
            # CROSS-CHECKED against the lead's own outbound message and row, never assumed.
            since = time.strftime('%Y-%m-%dT%H:%M:%S+00:00', time.gmtime(time.time() - 1))
            ts = [threading.Thread(target=send, args=(ph, PICK[lang](wd, hh))) for ph in (A, B)]
            for t in ts: t.start()
            for t in ts: t.join()
            ids = {A: lead_id(A), B: lead_id(B)}
            runs, outs = [], {}
            for _ in range(60):
                runs = db('GET', f'automation_runs?select=status,error_type,payload&client_automation_id=eq.{ca["id"]}&started_at=gte.{q(since)}&order=started_at.asc&limit=3')
                outs = {ph: outbound_after(ids[ph], LAST_SID[ph]) for ph in (A, B)}
                if len(runs) >= 2 and all(outs.values()): break
                time.sleep(3)
            if len(runs) != 2: bad.append(f'race: {len(runs)} runs, expected 2')
            by_phone, mapped_by = {}, {}
            for r in runs:
                sid = (r.get('payload') or {}).get('twilio_sid')
                for ph in (A, B):
                    if sid and any(o['external_id'] == sid for o in outs.get(ph, [])):
                        by_phone[ph] = r; mapped_by[ph] = 'sid'
            left_runs = [r for r in runs if all(r is not v for v in by_phone.values())]
            left_phones = [ph for ph in (A, B) if ph not in by_phone]
            if len(left_runs) == 1 and len(left_phones) == 1:
                by_phone[left_phones[0]] = left_runs[0]; mapped_by[left_phones[0]] = 'elimination'
            if len(by_phone) != 2: bad.append(f'race: could map {len(by_phone)} of {len(runs)} runs to their leads')
            ra_, rb_ = by_phone.get(A) or {}, by_phone.get(B) or {}
            pa, pb = ra_.get('payload') or {}, rb_.get('payload') or {}
            lang_of = lambda p_: p_.get('reply_lang') or p_.get('handoff_lang')
            fields = ('booking_result', 'event_id', 'reply_lang', 'handoff_lang', 'booking_intent', 'escalated', 'reasons')
            rec['A'] = dict({k: pa.get(k) for k in fields}, status=ra_.get('status'), mapped_by=mapped_by.get(A))
            rec['B'] = dict({k: pb.get(k) for k in fields}, status=rb_.get('status'), mapped_by=mapped_by.get(B))
            results_ab = [pa.get('booking_result'), pb.get('booking_result')]
            if results_ab.count('created') != 1: bad.append(f'race: {results_ab.count("created")} bookings, expected exactly 1 ({results_ab})')
            win_ph = A if pa.get('booking_result') == 'created' else B
            lose_ph = B if win_ph == A else A
            pw, pl = (pa, pb) if win_ph == A else (pb, pa)
            rl = rb_ if win_ph == A else ra_
            # the cross-check: the winner was sent the model's reply; the loser (24 Sep 2026)
            # the SYSTEM's lost-slot sentence with the remaining slots, never a hand-over while
            # slots are left; the loser's row holds no booking
            if [o['origin'] for o in outs.get(win_ph, [])] != ['ai']: bad.append(f"race: winner's outbound {[o['origin'] for o in outs.get(win_ph, [])]}, expected ['ai']")
            lose_row = db('GET', f'leads?select=qualification&id=eq.{ids[lose_ph]}')[0]
            if ((lose_row['qualification'] or {}).get('booking')): bad.append("race: the loser's row holds a booking")
            ls_ = pl.get('lost_slot') or {}
            if ls_.get('path') == 'race':
                rec['loser_caught_by'] = 're-check' if pl.get('booking_error') == 'slot_taken_since_offer' else "Google's 409"
            elif ls_.get('path') == 'sequential':
                rec['loser_caught_by'] = 'intent (taken)'
            else:
                bad.append(f"race: loser not handled as a lost slot: {pl.get('booking_result')} / {pl.get('booking_intent')} / {pl.get('reasons')}")
                rec['loser_caught_by'] = 'unexpected'
            if pl.get('escalated'): bad.append(f"race: the loser was escalated with slots left: {pl.get('reasons')}")
            if rl.get('status') == 'error' or pl.get('system_failure'): bad.append(f"race: a lost race recorded as a system failure (status {rl.get('status')})")
            reoffer = lost_slot_check(lose_ph, pl, lang, S['local'], taken_by_c, bad, 'race loser')
            rec['reoffer'] = [s_['local'] for s_ in reoffer]
            # Condition 2: a SECOND loss in a row hands over with the card, no loop of re-offers.
            # A fourth lead books the first re-offered slot; the loser then picks it.
            if reoffer:
                U = reoffer[0]
                Dph = '+35194' + f'{stamp:05d}{i:02d}'
                new_lead(Dph); turn(ca['id'], Dph, ASK[lang])
                lu_ = datetime.datetime.fromisoformat(U['local'])
                pick_u = PICK[lang](WEEKDAY[lang][lu_.weekday()], lu_.strftime('%H:%M'))
                if U['local'] not in [s_['local'] for s_ in offered(Dph)]: bad.append('second loss: the fourth lead was not offered the slot')
                else:
                    _, rd_ = turn(ca['id'], Dph, pick_u)
                    if ((rd_ or {}).get('payload') or {}).get('booking_result') != 'created': bad.append('second loss: the fourth lead could not book it')
                    else:
                        rec['extra_booked'] = rec.get('extra_booked', 0) + 1
                        _, r2 = turn(ca['id'], lose_ph, pick_u)
                        p2 = (r2 or {}).get('payload') or {}
                        oa2 = p2.get('operator_alert') or {}
                        f2 = {x.get('key'): x.get('value') for x in ((oa2.get('card') or {}).get('fields') or [])}
                        rec['second_loss'] = {'escalated': p2.get('escalated'), 'reasons': p2.get('reasons'), 'alert': oa2.get('sent_as'), 'motivo': f2.get('motivo')}
                        if not p2.get('escalated') or 'booking_lost_race:second_in_a_row' not in (p2.get('reasons') or []):
                            bad.append(f"second loss: not handed over as second_in_a_row: {p2.get('reasons')} / {(p2.get('lost_slot') or {}).get('outcome')}")
                        if oa2.get('sent_as') != 'card': bad.append(f"second loss: the operator got {oa2.get('sent_as')!r}, not the card")
                        if f2.get('motivo') != 'perdeu dois horários seguidos para outros clientes': bad.append(f"second loss: card Motivo {f2.get('motivo')!r}")
                        rep_ = last_reply(lose_ph)
                        if LS_TEXT[lang]['second_in_a_row'] not in rep_: bad.append(f"second loss: the lead was not sent the system's sentence: {rep_[:90]!r}")
                        if APOLOGY.search(rep_): bad.append('second loss: the handoff apologises')
            if lang_of(pa) != lang or lang_of(pb) != lang: bad.append(f"language {lang_of(pa)}/{lang_of(pb)}, expected {lang}")
            reply = last_reply(win_ph)
            rec['A_reply'] = reply
            if hh not in reply and hh.lstrip('0') not in reply: bad.append(f'winner confirmation does not name {hh}')
            pa = pw  # the calendar check below follows the winner
        else:
            # A books
            code, ra = turn(ca['id'], A, PICK[lang](wd, hh))
            pa = (ra or {}).get('payload') or {}
            rec['A'] = {k: pa.get(k) for k in ('booking_result', 'event_id', 'viewing_event_status', 'reply_lang', 'booking_intent')}
            if pa.get('booking_result') != 'created': bad.append(f"A not booked: booking_result {pa.get('booking_result')} (intent {pa.get('booking_intent')})")
            if pa.get('reply_lang') != lang: bad.append(f"A reply_lang {pa.get('reply_lang')}")
            reply = last_reply(A)
            rec['A_reply'] = reply
            if hh not in reply and hh.lstrip('0') not in reply: bad.append(f'A confirmation does not name {hh}')
            # B tries the same slot, after A's booking exists. 🔒 Corrected 22 Sep 2026:
            # sequentially the workflow already sees S busy and declines at the intent
            # (booking_intent 'taken', booking_result 'not_attempted'); the RE-CHECK
            # (slot_taken) is only reachable in a race (--race). Either way: not booked.
            code, rb = turn(ca['id'], B, PICK[lang](wd, hh))
            pb = (rb or {}).get('payload') or {}
            rec['B'] = {k: pb.get(k) for k in ('booking_result', 'event_id', 'reply_lang', 'booking_intent', 'escalated')}
            rec['B_reply'] = last_reply(B)
            if pb.get('booking_result') == 'created': bad.append('B was BOOKED into a slot A already holds')
            if pb.get('booking_result') not in ('slot_taken', 'not_attempted') or (pb.get('booking_result') == 'not_attempted' and pb.get('booking_intent') != 'taken'):
                bad.append(f"B refused for an unexpected reason: {pb.get('booking_result')} / intent {pb.get('booking_intent')}")
            if pb.get('reply_lang') != lang: bad.append(f"B reply_lang {pb.get('reply_lang')}")
            if pb.get('escalated'): bad.append(f"B was escalated with slots left: {pb.get('reasons')}")
            rec['B']['lost_slot'] = {k: (pb.get('lost_slot') or {}).get(k) for k in ('path', 'outcome', 'detail', 'prose_used', 'warnings')}
            reoffer_b = lost_slot_check(B, pb, lang, S['local'], [], bad, 'B')
            rec['B_reoffer'] = [s_['local'] for s_ in reoffer_b]
        # the calendar itself
        evs = [e for e in calendar_events() if e.get('status') != 'cancelled' and e.get('start')]
        at_s = [e for e in evs if utc(e['start']) == utc(S['local'])]
        mine = [e for e in evs if e['id'] == pa.get('event_id')]
        if len(mine) != 1: bad.append(f"A's event {pa.get('event_id')} not in the gate calendar")
        elif utc(mine[0]['start']) != utc(S['local']): bad.append(f"A's event starts {mine[0]['start']}, offered {S['local']}")
        if len(at_s) != 1: bad.append(f'{len(at_s)} events at the slot (double booking if > 1)')
        # 🔒 The alerts, counted here and not read off a payload (22 Sep 2026).
        time.sleep(SETTLE)
        run_ids = {lead_id(A), lead_id(B)}
        for extra in ('+35193', '+35194'):
            ph_ = extra + f'{stamp:05d}{i:02d}'
            if db('GET', f'leads?select=id&client_id=eq.{cid}&phone=eq.{q(ph_)}'): run_ids.add(lead_id(ph_))
        inv = [e for e in events_since('invariant.violated', run_since) if (e.get('data') or {}).get('lead_id') in run_ids]
        esc = [e for e in events_since('lead.escalated', run_since) if (e.get('data') or {}).get('lead_id') in run_ids]
        rec['invariant_alerts'] = [(e['data'].get('invariant'), e['data'].get('slug')) for e in inv]
        rec['escalations'] = len(esc)
        if inv: bad.append(f'{len(inv)} invariant alert(s): {rec["invariant_alerts"]}')
        # 24 Sep 2026: a lost slot with slots left is NOT an escalation; in a race run the
        # one expected escalation is the loser's SECOND loss in a row.
        want_esc = 1 if (args.race and rec.get('second_loss')) else 0
        if len(esc) != want_esc: bad.append(f'{len(esc)} escalation(s), expected {want_esc}')
    except Exception as e:
        bad.append(f'the run itself errored: {e}')
    results.append(rec)
    print(f"run {i:2d} {lang} slot {rec.get('slot', '-')} -> {'OK' if not bad else 'FAIL: ' + '; '.join(bad)}", flush=True)
    json.dump({'start': start_iso, 'stamp': stamp, 'runs': results}, open(args.out, 'w'), ensure_ascii=False, indent=1)

booked = db('GET', f'events?select=type&client_id=eq.{cid}&type=eq.viewing.booked&created_at=gte.{q(start_iso)}')
created = sum(1 for r in results if 'created' in [(r.get('A') or {}).get('booking_result'), (r.get('B') or {}).get('booking_result')])
# In a race run the third and fourth leads each book a slot on purpose (condition 1 and
# condition 2, 24 Sep 2026): their events are real bookings and count as such.
extra = sum(r.get('extra_booked', 0) for r in results)
print(f'\nBOOKING GATE: {len(results)} runs')
print(f'  booked (A created):           {created}')
print(f'  second lead not booked:       {sum(1 for r in results if (r.get("B") or {}).get("booking_result") != "created" or (r.get("A") or {}).get("booking_result") != "created")}')
print(f'  caught by the re-check:       {sum(1 for r in results if "slot_taken" in json.dumps([r.get("A"), r.get("B")]))}')
print(f'  viewing.booked events:        {len(booked)} (must equal booked {created} + the extra leads\' {extra})')
print(f'  language right, both leads:   {sum(1 for r in results if all(((r.get(k) or {}).get("reply_lang") or (r.get(k) or {}).get("handoff_lang")) == r["lang"] for k in ("A", "B")))}')
if args.race:
    from collections import Counter
    print(f'  loser caught by:              {dict(Counter(r.get("loser_caught_by") for r in results))}')
# The whole window, once more, after the last run settled: an alert for ANY gate lead counts.
all_inv = events_since('invariant.violated', start_iso)
print(f'  invariant alerts (whole run): {len(all_inv)}  {[(e["data"].get("invariant"), e["data"].get("slug")) for e in all_inv]}')
# And the escalations over the whole window, for the same reason: a run that ends early
# ("no slot offered to both") never reaches its per-run count. On 22 Sep run 8 escalated
# (bad_reply_twice) and the per-run total said 0. Expected: exactly one per lost race.
all_esc = [e for e in events_since('lead.escalated', start_iso)]
want_esc = sum(1 for r in results if r.get('second_loss'))
print(f'  escalations (whole run):      {len(all_esc)} (expected {want_esc}: one per second loss in a row)')
lost = [r for r in results if r.get('reoffer') or r.get('B_reoffer')]
print(f'  lost slots re-offered by the system: {len(lost)}; second losses handed over with the card: '
      f'{sum(1 for r in results if (r.get("second_loss") or {}).get("alert") == "card")}')
n_read, broken = delivered_broken(db, cid, start_iso, args.parse_reply_src)
print(f'  delivered messages read:      {n_read}, broken: {len(broken)}')
for b in broken: print(f'    BROKEN {b["at"]} {b["origin"]}: {b["why"]}')
print(f'  runs with any problem:        {sum(1 for r in results if r["problems"])}')
ok = (all(not r['problems'] for r in results) and len(booked) == created + extra and not all_inv and len(all_esc) == want_esc
      and n_read > 0 and not broken)
# The lost races escalated their losers on purpose; clear them, and any backlog.
cleared, not_cleared = clear_gate_escalations(db, cid)
print(f'  gate escalations cleared:     {cleared}' + (f', NOT cleared: {not_cleared}' if not_cleared else ''))
ok = ok and not not_cleared
print('PASS' if ok else 'FAIL')
# The gate record (infra/scripts/gate_record.py, 25 Sep 2026): this verdict, bound to the
# gated source only if the gate served is the verified build. A deploy reads it.
try:
    gate_record.record('gate_booking', 'PASS' if ok else 'FAIL', {'runs': args.runs, 'race': bool(args.race)}, E)
except Exception as _e:
    print('gate record NOT written:', _e)

