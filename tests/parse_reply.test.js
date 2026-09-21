#!/usr/bin/env node
// Unit tests for src/parse_reply.js: the parse steps ParseClaude and
// ParseGuardRetry share. Loads the SHIPPING source (after
// src/appointment_kind.js, whose viewingClaim() it calls, as the nodes embed it).
//
//   node tests/parse_reply.test.js
//   PARSE_REPLY_SRC=path node tests/parse_reply.test.js
const fs = require('fs');
const path = require('path');
eval(fs.readFileSync(path.join(__dirname, '..', 'src', 'appointment_kind.js'), 'utf8'));
eval(fs.readFileSync(process.env.PARSE_REPLY_SRC || path.join(__dirname, '..', 'src', 'parse_reply.js'), 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };
const res200 = (text) => ({ statusCode: 200, body: { stop_reason: 'end_turn', content: [{ type: 'thinking' }, { type: 'text', text }] } });
// IsRetryableReply's own condition, copied from the node so the routing is tested with the parse:
const retried = (j) => j.errorType === 'bad_reply' && !j.wasGuardRetry;

console.log('\n🔴 the live empty reply, execution 4569 (21 Sep 2026), the model\'s output WORD FOR WORD');
const EXEC_4569 = ' {"reply": "","lead_type":"buyer","full_name":"João","budget_min":null,"budget_max":null,"timeline":null,"area":"Cascais","qualification_notes":{"financing":null,"bedrooms":3,"purpose":null},"stage":"qualified","intent":"booking","wants_booking":true,"proposed_times":["Thursday 24 September 2026 at 09:00 Lisbon time","Thursday 24 September 2026 at 10:00 Lisbon time"],"needs_human":false,"escalation_reason":null}';
{
  const pr = parseModelResponse(res200(EXEC_4569));
  chk('it parses: valid JSON, the reply field is simply empty', pr.ok === true && pr.parsed.reply === '');
  const shape = checkReplyShape(pr.parsed);
  chk('an empty reply is bad_reply (it was bad_json, which is never retried)', shape && shape.errorType === 'bad_reply' && shape.errorMessage === 'empty reply', JSON.stringify(shape));
  const first = makeParseFail({ body: '11:00?' }, 5, {})(shape.errorType, shape.errorMessage)[0].json;
  chk('FIRST empty reply -> IsRetryableReply retries it (one guard retry)', retried(first) === true);
  const second = makeParseFail({ body: '11:00?' }, 5, { wasGuardRetry: true })(shape.errorType, shape.errorMessage)[0].json;
  chk('SECOND empty reply (in ParseGuardRetry) -> not retried, so it escalates as bad_reply_twice', retried(second) === false && second.wasGuardRetry === true);
  chk('whitespace only is empty too', checkReplyShape(Object.assign({}, pr.parsed, { reply: '   ' })).errorType === 'bad_reply');
}

console.log('\nthe schema failing is still bad_json');
{
  const base = JSON.parse(EXEC_4569); base.reply = 'Tenho terça às 10:00. Serve?';
  chk('a reply that is not a string', checkReplyShape(Object.assign({}, base, { reply: 42 })).errorType === 'bad_json');
  const noKey = Object.assign({}, base); delete noKey.intent;
  chk('a missing key', checkReplyShape(noKey).errorMessage === 'missing key: intent');
  chk('needs_human not boolean', checkReplyShape(Object.assign({}, base, { needs_human: 'no' })).errorMessage === 'needs_human not boolean');
  chk('not an object at all (was an uncaught throw)', checkReplyShape(null).errorType === 'bad_json' && checkReplyShape([1]).errorType === 'bad_json');
  chk('a good reply passes', checkReplyShape(base) === null);
}

console.log('\nparseModelResponse: the transport failures');
chk('401 -> claude_auth', parseModelResponse({ statusCode: 401 }).errorType === 'claude_auth');
chk('404 -> claude_bad_request', parseModelResponse({ statusCode: 404 }).errorType === 'claude_bad_request');
chk('503 -> claude_unavailable', parseModelResponse({ statusCode: 503 }).errorType === 'claude_unavailable');
chk('refusal', parseModelResponse({ statusCode: 200, body: { stop_reason: 'refusal' } }).errorType === 'claude_refusal');
chk('max_tokens', parseModelResponse({ statusCode: 200, body: { stop_reason: 'max_tokens' } }).errorType === 'claude_truncated');
chk('fenced JSON is unwrapped', parseModelResponse(res200('```json\n{"a":1}\n```')).parsed.a === 1);
chk('prose is bad_json', parseModelResponse(res200('not json')).errorType === 'bad_json');

console.log('\n🔴 the garbled reply (21 Sep measurement), WORD FOR WORD');
const GARBLED = 'ueero elosesa hora concreo, ualdebo confentar que el actualmente no tenemos ninguna cita agendada. Puedo confirmar directamente el jueves 10 de septiembre a las 11:00, hora de Lisbo,, si le viene bien.dígame para me confirma y quedaría, y con gusto lo dejo registado.ado con si me lo confirma.';
chk('it is caught', replyLooksBroken(GARBLED) !== null, replyLooksBroken(GARBLED));
chk('  by the doubled comma', /doubled punctuation/.test(replyLooksBroken(GARBLED)));
chk('  and the glued stop catches it on its own too', replyLooksBroken(GARBLED.replace(',,', ',')) !== null && /glued/.test(replyLooksBroken(GARBLED.replace(',,', ','))));
chk('through checkReplyShape it is bad_reply, so it gets the one retry', checkReplyShape(Object.assign(JSON.parse(EXEC_4569), { reply: GARBLED })).errorType === 'bad_reply');

console.log('\nweb addresses and domains are the exception, not a false positive');
for (const t of ['Pode ver a nossa página em g.page/ryvo ou escrever para hello@ryvodigital.com, obrigado.',
                 'See https://ryvodigital.com/imoveis?id=12 for the full listing, please.',
                 'The listing is on www.idealista.pt and on maps.app.goo.gl/abc as well.',
                 'Write to agent.name@agency.co.uk if you prefer email.']) {
  chk(`passes: ${t.slice(0, 50)}`, replyLooksBroken(t) === null, replyLooksBroken(t));
}

console.log('\nthe older markers still hold');
chk('too short', /too short/.test(replyLooksBroken('Olá!')));
chk('starts with punctuation (the 3 Sep reply)', /starts with punctuation/.test(replyLooksBroken(': corrigir - vou responder corretamente.}')));
chk('a brace', /brace/.test(replyLooksBroken('Claro, tenho terça {slot} às 10:00 livre.')));

console.log('\n🔒 FALSE POSITIVES: every real reply captured on 21 Sep (tests/fixtures)');
{
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'real_replies_2026-09-21.json'), 'utf8')).replies;
  const good = fx.filter(r => !r.garbled), bad = fx.filter(r => r.garbled);
  const fp = good.filter(r => replyLooksBroken(r.reply) !== null);
  chk(`0 of ${good.length} good real replies flagged`, fp.length === 0, fp.map(r => replyLooksBroken(r.reply) + ' :: ' + r.reply.slice(0, 60)).join(' | '));
  chk(`every garbled real reply flagged (${bad.length})`, bad.length > 0 && bad.every(r => replyLooksBroken(r.reply) !== null));
}

console.log('\nallowedTimesFor, viewingClaimFailure, saneBudgets');
{
  const b = { slots: [{ timeLocal: '09:00' }], bookingSlot: { local: '2026-09-24T10:00:00.000+01:00' }, bookingIntent: 'already_booked', existingBooking: { local: '2026-09-22T15:00:00.000+01:00' } };
  chk('offered + this turn\'s booking + a held booking', JSON.stringify(allowedTimesFor(b).map(x => x.timeLocal)) === '["09:00","10:00","15:00"]');
  chk('a viewing claim with no property named fails', viewingClaimFailure({ appointmentKind: 'meeting' }, 'A sua visita está confirmada para quinta-feira.') !== null);
  chk('...and passes when the appointment IS a viewing', viewingClaimFailure({ appointmentKind: 'viewing' }, 'A sua visita está confirmada para quinta-feira.') === null);
  const p = { budget_min: 500, budget_max: 2000000 };
  const r = saneBudgets(p);
  chk('an implausible bound is rejected and nulled', p.budget_min === null && p.budget_max === 2000000 && r.rejected[0] === 500);
  const q = { budget_min: 900000, budget_max: 800000 };
  chk('an inverted pair is flagged, not nulled', saneBudgets(q).budgetInconsistent === true && q.budget_min === 900000);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
