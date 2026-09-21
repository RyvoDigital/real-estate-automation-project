#!/usr/bin/env python3
"""Build a SABOTAGE variant of the patched Concierge workflow for the live proof (§0.7).

Never commit, never leave published. The variant behaves normally unless the inbound
message carries a marker:
  SABOTAGE-A  -> AssertInvariants is fed a text that names a time, claims a booking and
                 states a rejected budget, against a row holding a name nobody used, an
                 unverified booking and no offer  => 1, 2, 3, 5 fire before the send;
                 AssertDelivery is told the send did not happen             => 4 fires at run end
  SABOTAGE-B  -> AssertInvariants is told an event was created this turn and the row
                 write failed                                               => 3b fires
  SABOTAGE-C  -> AssertDelivery is told a disclosure was required on a message whose
                 text carried none                                          => 6 fires
                 (the lead still receives a correctly disclosed message: the sabotage
                 falsifies the EVIDENCE the check reads, never the text sent)
  SABOTAGE-D  -> SendHandoffNote is sent to an invalid number, so the handoff note
                 REALLY fails at Twilio      => the run is status='error',
                 error_type='handoff_send_failed'; invariant 4 fires; the health
                 check emails. The message must escalate (ask for a person).
Output: tests/ryvoInboundConc01.SABOTAGE.json (gitignored: never commit, never leave published)

  python3 tests/sabotage_invariants.py
"""
import json, os, sys
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.dirname(os.path.abspath(__file__))
w = json.load(open(os.path.join(REPO, 'workflows', 'ryvoInboundConc01.json'), encoding='utf-8'))
by = {n['name']: n for n in w['nodes']}

def sub(node, old, new):
    js = by[node]['parameters']['jsCode']
    assert js.count(old) == 1, (node, old[:60], js.count(old))
    by[node]['parameters']['jsCode'] = js.replace(old, new)

sub('AssertInvariants',
    "  result = checkInvariants({\n    textSent, sentKind, escalating,\n    row, leadUpdateOk: lu.leadUpdateOk !== false,\n"
    "    bookingResult: lu.bookingResult || null, bookedEventId: lu.bookedEventId || null, bookingSlot: lu.bookingSlot || null,\n"
    "    bookingIntent: lu.bookingIntent || 'none', existingBooking: lu.existingBooking || null,\n"
    "    bookingCheck: rb.bookingCheck || 'none', bookingRetired: rb.bookingRetired || null,\n"
    "    rejectedBudgets: lu.rejectedBudgets || [],\n",
    "  const SAB_A = /SABOTAGE-A/.test(String(lu.body || ''));\n"
    "  const SAB_B = /SABOTAGE-B/.test(String(lu.body || ''));\n"
    "  const SAB_ROW = { full_name: 'Zacarias Sabotado', budget_min: 999999, budget_max: 999999,\n"
    "    qualification: { name_source: 'stated', booking: { event_id: 'sabotage-unverified', local: '2026-09-21T09:00:00.000+01:00' } } };\n"
    "  result = checkInvariants({\n"
    "    textSent: SAB_A ? 'Olá Zé, já tem uma reunião marcada para terça-feira às 15:00. Registei o seu orçamento de 1.100.000€.' : textSent,\n"
    "    sentKind, escalating,\n"
    "    row: SAB_A ? SAB_ROW : (SAB_B ? Object.assign({}, row, { qualification: {} }) : row),\n"
    "    leadUpdateOk: SAB_B ? false : (lu.leadUpdateOk !== false),\n"
    "    bookingResult: SAB_B ? 'created' : (lu.bookingResult || null),\n"
    "    bookedEventId: SAB_B ? 'sabotage-created' : (lu.bookedEventId || null), bookingSlot: lu.bookingSlot || null,\n"
    "    bookingIntent: lu.bookingIntent || 'none', existingBooking: lu.existingBooking || null,\n"
    "    bookingCheck: SAB_A ? 'none' : (rb.bookingCheck || 'none'), bookingRetired: rb.bookingRetired || null,\n"
    "    rejectedBudgets: SAB_A ? [1100000] : (lu.rejectedBudgets || []),\n")

sub('AssertDelivery',
    "  d = checkDelivery(run);\n",
    "  const SAB_A = /SABOTAGE-A/.test(String(a.body || ''));\n"
    "  const SAB_C = /SABOTAGE-C/.test(String(a.body || ''));\n"
    "  let sabRun = run;\n"
    "  if (SAB_A) sabRun = Object.assign({}, run, { payload: Object.assign({}, run.payload || {}, { twilio_sid: null, handoff_sent: false }) });\n"
    "  // 6: claim a disclosure was due, and hand the check a sent_head with no AI term\n"
    "  // in it. The lead's actual message is untouched -- only the evidence lies.\n"
    "  if (SAB_C) sabRun = Object.assign({}, run, { payload: Object.assign({}, run.payload || {}, {\n"
    "    twilio_sid: (run.payload || {}).twilio_sid || 'SMsabotage',\n"
    "    disclosure: { required: true, reason: 'first_contact', ever_before: false, lang: 'pt', v: 1,\n"
    "                  applied: true, sent_head: 'Ola! Sou a Sofia. Em que posso ajudar?' } }) });\n"
    "  d = checkDelivery(sabRun);\n")

# SABOTAGE-D (21 Sep 2026): the HANDOFF SEND itself fails. Unlike A-C this is
# not false evidence. SendHandoffNote is given an invalid `To`, so Twilio
# really rejects it (400, 21211) and the failure travels the real path:
# AfterHandoff sets handoffOk=false, PrepRunEscalated must write
# status='error' / error_type='handoff_send_failed', invariant 4 must still
# fire, and the health check must email. Needs a message that ESCALATES, e.g.
# "Quero falar com uma pessoa, por favor. SABOTAGE-D". The operator is still
# notified; the lead (the test phone) receives no handoff note, which is the
# failure under test.
hn = by['SendHandoffNote']['parameters']['bodyParameters']['parameters']
to = [p for p in hn if p['name'] == 'To']
assert len(to) == 1 and to[0]['value'] == "=whatsapp:{{ $('AfterBooking').first().json.from }}", to
# Gated on the Webhook node, which runs on EVERY path: AfterLeadUpdate does not
# run on every escalation path, and an expression that throws there would cost a
# real lead their handoff for as long as this build is published.
to[0]['value'] = ("={{ /SABOTAGE-D/.test(String((($('Webhook').first().json.body) || {}).Body || '')) "
                  "? 'whatsapp:+000' : 'whatsapp:' + $('AfterBooking').first().json.from }}")

out = os.path.join(HERE, 'ryvoInboundConc01.SABOTAGE.json')
json.dump(w, open(out, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
print('wrote', out)
