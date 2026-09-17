#!/usr/bin/env node
// Unit tests for src/ai_disclosure.js, plus invariant 6 in src/invariants.js.
// Loads the SHIPPING sources rather than copies, so the tests cannot drift from
// what the workflow embeds.
//
//   node tests/ai_disclosure.test.js
const fs = require('fs');
const path = require('path');
const S = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
eval(S('ai_disclosure.js'));
// invariants.js reuses the detectors in these three, and checkDelivery's
// invariant 6 calls disclosureIn() from the file above.
eval(S('booking_claim.js') + S('booking_stated.js') + S('reply_name.js') + S('invariants.js'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };
const CFG = { agent_name: 'Sofia', agency_name: 'Ryvo Test Client', default_language: 'pt' };
const NAMES = { agent: 'Sofia', agency: 'Ryvo Test Client' };
let r;

// ---------------------------------------------------------------------------
console.log('\nthe banner renders in all three languages, with config names');
for (const lang of ['pt', 'en', 'es']) {
  const t = disclosureText(CFG, lang, NAMES);
  chk(lang + ': names the agency', t.indexOf('Ryvo Test Client') !== -1, t);
  chk(lang + ': names the agent', t.indexOf('Sofia') !== -1);
  chk(lang + ': no unfilled placeholder', t.indexOf('{') === -1);
  chk(lang + ': satisfies its own detector', disclosureIn(t) === true);
  chk(lang + ': says it is not a person',
    /n[ãa]o (por uma|sou uma|uma) pessoa|not by a person|no una persona/.test(t), t);
}

console.log('\nthe three languages are actually different text');
chk('pt !== en !== es',
  new Set(['pt', 'en', 'es'].map(l => disclosureText(CFG, l, NAMES))).size === 3);

console.log('\nan unknown language falls back to English, never to nothing');
chk('lang null -> en', disclosureText(CFG, null, NAMES) === disclosureText(CFG, 'en', NAMES));
chk('lang "fr" -> en', disclosureText(CFG, 'fr', NAMES) === disclosureText(CFG, 'en', NAMES));

// ---------------------------------------------------------------------------
console.log('\na client cannot configure themselves out of compliance');
const BAD = { ...CFG, system_messages: { ai_disclosure: { pt: 'Olá! Fala com a nossa equipa.' } } };
r = disclosureText(BAD, 'pt', NAMES);
chk('an override that discloses nothing is rejected for the built-in',
  r === disclosureText({}, 'pt', NAMES).replace('{agency}', '') || disclosureIn(r) === true, r);
chk('...and the result still discloses', disclosureIn(r) === true);
const EMPTY = { ...CFG, system_messages: { ai_disclosure: { pt: '   ' } } };
chk('an empty override is rejected', disclosureIn(disclosureText(EMPTY, 'pt', NAMES)) === true);
const MISSING = { ...CFG, system_messages: {} };
chk('no ai_disclosure key at all still discloses', disclosureIn(disclosureText(MISSING, 'pt', NAMES)) === true);
const GOOD = { ...CFG, system_messages: { ai_disclosure: { pt: '{agent} é um assistente virtual da {agency}. Não é uma pessoa.' } } };
r = disclosureText(GOOD, 'pt', NAMES);
chk('a valid override IS used', r.indexOf('é um assistente virtual') !== -1, r);
chk('...with its placeholders filled', r.indexOf('Sofia') !== -1 && r.indexOf('Ryvo Test Client') !== -1);

console.log('\nresolution never crosses languages');
const PT_ONLY = { ...CFG, system_messages: { ai_disclosure: { pt: 'Assistente virtual. Não é uma pessoa.' } } };
chk('a pt-only override does not leak into the en banner',
  disclosureText(PT_ONLY, 'en', NAMES) === disclosureText({}, 'en', NAMES).replace(/\{agent\}/g, 'Sofia').replace(/\{agency\}/g, 'Ryvo Test Client'));

// ---------------------------------------------------------------------------
console.log('\ndisclosureIn(): what counts as telling someone');
chk('artificial intelligence, en', disclosureIn('This is answered by artificial intelligence.') === true);
chk('inteligência artificial, pt', disclosureIn('Respondido por inteligência artificial.') === true);
chk('inteligencia artificial unaccented', disclosureIn('Respondido por inteligencia artificial.') === true);
chk('asistente virtual, es', disclosureIn('Soy un asistente virtual.') === true);
chk('assistente automático, pt', disclosureIn('Sou um assistente automático.') === true);
chk('the standalone acronym AI', disclosureIn('I am an AI, not a person.') === true);
chk('the standalone acronym IA', disclosureIn('Sou uma IA, não uma pessoa.') === true);

console.log('\n...and what does not');
chk('"assistant" alone is NOT a disclosure -- a human receptionist is an assistant',
  disclosureIn('Hello! I am Sofia, an assistant at Ryvo.') === false);
chk('"assistente" alone is not either',
  disclosureIn('Olá! Sou a Sofia, assistente da Ryvo.') === false);
chk('the Portuguese word "ai" is not the acronym',
  disclosureIn('Ai, que pena! Vou verificar isso para si.') === false);
chk('a lowercase "ia" inside a word is not the acronym',
  disclosureIn('A Sofia trabalha na agência e liga já.') === false);
chk('empty text discloses nothing', disclosureIn('') === false && disclosureIn(null) === false);
chk('an AI term buried in paragraph four is NOT a disclosure at first interaction',
  disclosureIn('Olá!\n\nTemos duas casas.\n\nPosso ajudar.\n\nSou inteligência artificial.') === false);

// ---------------------------------------------------------------------------
console.log('\nshouldDisclose(): the predicate is delivery, not novelty');
r = shouldDisclose({ everDisclosed: false });
chk('never disclosed -> first_contact', r.required === true && r.reason === 'first_contact');
r = shouldDisclose({ everDisclosed: false, lastOutboundAt: '2026-09-16T10:00:00Z', lastOutboundOrigin: 'ai' });
chk('a lead who was ANSWERED but never disclosed to is still first_contact',
  r.required === true && r.reason === 'first_contact',
  'this is the isNewLead trap: the row exists, the duty does not go away');
r = shouldDisclose({ everDisclosed: true, lastOutboundOrigin: 'ai', lastOutboundAt: '2026-09-16T10:00:00Z', now: '2026-09-16T11:00:00Z' });
chk('disclosed, AI still replying -> no repeat', r.required === false && r.reason === null);

console.log('\nhandback');
r = shouldDisclose({ everDisclosed: true, lastOutboundOrigin: 'human', lastOutboundAt: '2026-09-16T10:00:00Z', now: '2026-09-16T10:05:00Z' });
chk('a human replied last -> handback', r.required === true && r.reason === 'handback');
r = shouldDisclose({ everDisclosed: true, lastOutboundOrigin: 'handoff', lastOutboundAt: '2026-09-16T10:00:00Z', now: '2026-09-16T10:05:00Z' });
chk('the fixed handoff NOTE is not a human -> no handback',
  r.required === false, 'the note is the AI system\'s own output');
r = shouldDisclose({ everDisclosed: true, lastOutboundOrigin: 'system', lastOutboundAt: '2026-09-16T10:00:00Z', now: '2026-09-16T10:05:00Z' });
chk('a fixed system message is not a human either', r.required === false);

console.log('\nthe long gap');
r = shouldDisclose({ everDisclosed: true, lastOutboundOrigin: 'ai', lastOutboundAt: '2026-06-01T10:00:00Z', now: '2026-09-16T10:00:00Z' });
chk('107 days at the 30-day default -> gap', r.required === true && r.reason === 'gap');
r = shouldDisclose({ everDisclosed: true, lastOutboundOrigin: 'ai', lastOutboundAt: '2026-09-01T10:00:00Z', now: '2026-09-16T10:00:00Z' });
chk('15 days -> no repeat', r.required === false);
r = shouldDisclose({ everDisclosed: true, lastOutboundOrigin: 'ai', lastOutboundAt: '2026-09-01T10:00:00Z', now: '2026-09-16T10:00:00Z', gapDays: 7 });
chk('15 days at a configured 7 -> gap', r.required === true && r.reason === 'gap');
chk('exactly at the boundary counts',
  shouldDisclose({ everDisclosed: true, lastOutboundOrigin: 'ai', lastOutboundAt: '2026-08-17T10:00:00Z', now: '2026-09-16T10:00:00Z' }).reason === 'gap');
chk('a garbage timestamp does not fire the gap',
  shouldDisclose({ everDisclosed: true, lastOutboundOrigin: 'ai', lastOutboundAt: 'not a date', now: '2026-09-16T10:00:00Z' }).required === false);

console.log('\nfailsafe');
r = shouldDisclose({ failsafe: true, everDisclosed: true, lastOutboundOrigin: 'ai' });
chk('state unreadable -> disclose anyway', r.required === true && r.reason === 'failsafe',
  'over-disclosing is cosmetic; under-disclosing is the violation');
chk('precedence: first_contact outranks handback',
  shouldDisclose({ everDisclosed: false, lastOutboundOrigin: 'human' }).reason === 'first_contact');

// ---------------------------------------------------------------------------
console.log('\nwithDisclosure(): the prepend, and the 1600-character limit');
const BANNER = disclosureText(CFG, 'pt', NAMES);
r = withDisclosure(BANNER, 'Olá! Em que posso ajudar?');
chk('banner, blank line, then the reply', r.text === BANNER + '\n\n' + 'Olá! Em que posso ajudar?');
chk('applied is true', r.applied === true && r.overLimit === false);
chk('the result satisfies invariant 6\'s detector', disclosureIn(r.text) === true);
r = withDisclosure('', 'Olá!');
chk('no banner -> the body is untouched', r.text === 'Olá!' && r.applied === false);
r = withDisclosure(BANNER, '');
chk('an empty body still sends the banner', r.text.indexOf(BANNER) === 0 && r.applied === true);

const LONG = 'a'.repeat(1700);
r = withDisclosure(BANNER, LONG);
chk('over 1600: the result fits Twilio\'s limit', r.text.length <= 1600, String(r.text.length));
chk('over 1600: the DISCLOSURE survives, the reply is what gets cut',
  disclosureIn(r.text) === true && r.overLimit === true && r.droppedChars > 0);
chk('over 1600: the reader can see it was cut', /…$/.test(r.text));
const WORDS = ('palavra '.repeat(400)).trim();
r = withDisclosure(BANNER, WORDS);
chk('the cut lands on a word boundary', /palavra…$/.test(r.text), r.text.slice(-30));
r = withDisclosure(BANNER, 'Olá!', 60);
chk('a pathological cap still sends a disclosure', r.text.length <= 60 && r.overLimit === true);

console.log('\ndisclosureRecord()');
r = disclosureRecord('handback', 'es');
chk('shape is {v, lang, reason}', r.v === 1 && r.lang === 'es' && r.reason === 'handback');
chk('an unknown reason does not poison the row', disclosureRecord('nonsense', 'pt').reason === 'first_contact');
chk('an unknown language does not poison the row', disclosureRecord('gap', 'fr').lang === 'en');

// ---------------------------------------------------------------------------
console.log('\ndisclosureStateFrom(): assembling the state from the two reads');
const H = (rows) => rows;
r = disclosureStateFrom([], [], CFG);
chk('no disclosed row, no history -> first contact', shouldDisclose(r).reason === 'first_contact');
r = disclosureStateFrom([{ created_at: '2026-09-01T10:00:00Z' }], [], CFG);
chk('a disclosed row exists -> everDisclosed', r.everDisclosed === true);
r = disclosureStateFrom([{ created_at: '2026-09-01T10:00:00Z' }], H([
  { direction: 'inbound', created_at: '2026-09-16T12:00:00Z' },
  { direction: 'outbound', origin: 'human', created_at: '2026-09-16T11:00:00Z' },
  { direction: 'outbound', origin: 'ai', created_at: '2026-09-01T10:00:00Z' },
]), CFG);
chk('the most recent OUTBOUND row is the one read', r.lastOutboundOrigin === 'human');
chk('...so the human reply triggers handback', shouldDisclose(r).reason === 'handback');
r = disclosureStateFrom([{ created_at: '2026-09-01T10:00:00Z' }], H([
  { direction: 'outbound', origin: 'ai', created_at: '2026-09-01T10:00:00Z' },
  { direction: 'outbound', origin: 'human', created_at: '2026-08-01T10:00:00Z' },
]), CFG);
chk('order in the array does not matter -- it is sorted by created_at',
  r.lastOutboundOrigin === 'ai' && r.lastOutboundAt === '2026-09-01T10:00:00Z');
r = disclosureStateFrom([{ created_at: 'x' }], H([{ direction: 'outbound', origin: 'ai', created_at: '2026-09-01T10:00:00Z' }]),
  { ...CFG, disclosure_gap_days: 3 });
chk('config carries the gap threshold through', r.gapDays === 3);
chk('a non-array from a failed read does not throw',
  disclosureStateFrom(null, undefined, null).everDisclosed === false);

console.log('\ndisclosurePayload(): what the run row carries');
r = disclosurePayload({ required: true, reason: 'first_contact' },
  { everDisclosed: false, lastOutboundOrigin: null, lastOutboundAt: null }, 'pt', true, BANNER + '\n\nOlá!');
chk('required: the head of the text SENT is recorded', disclosureIn(r.sent_head) === true);
chk('required: reason, lang and version are recorded',
  r.required === true && r.reason === 'first_contact' && r.lang === 'pt' && r.v === 1);
chk('the head is the banner only, not the whole reply', r.sent_head.indexOf('Olá!') === -1);
r = disclosurePayload({ required: false, reason: null },
  { everDisclosed: true, lastOutboundOrigin: 'ai', lastOutboundAt: '2026-09-16T10:00:00Z' }, 'pt', false, 'Olá! Tudo bem?');
chk('not required: no sent_head, so the lead\'s words are not copied into the run row',
  r.sent_head === undefined && r.required === false);
chk('not required: it still records WHY not', r.ever_before === true && r.last_origin === 'ai');
chk('the payload round-trips through invariant 6',
  checkDelivery({ payload: { twilio_sid: 'SM1', outbound_row_status: 201,
    disclosure: disclosurePayload({ required: true, reason: 'gap' }, { everDisclosed: true }, 'en', true,
      disclosureText(CFG, 'en', NAMES) + '\n\nWelcome back!') } }).violated.indexOf('6') === -1);

// ---------------------------------------------------------------------------
console.log('\nthe banner must not trip the guards that read the text sent (§0.7)');
// nameMismatch is the live risk: GREET_RX matches a greeting word followed by
// whitespace and a capital, and the banner opens with the agent's name.
for (const lang of ['pt', 'en', 'es']) {
  const body = disclosureText(CFG, lang, NAMES) + '\n\n' + 'Olá! Em que posso ajudar?';
  chk(lang + ': the banner is not read as addressing the lead by the wrong name',
    nameMismatch(body, 'João Ferreira', { allow: ['Sofia', 'Ryvo Test Client'] }).mismatch === false);
  chk(lang + ': ...and not even without the allow list',
    nameMismatch(disclosureText(CFG, lang, NAMES), 'João Ferreira').mismatch === false);
  chk(lang + ': the banner names no time', timesNamedIn(disclosureText(CFG, lang, NAMES)).length === 0);
  chk(lang + ': the banner states no money', moneyAmountsIn(disclosureText(CFG, lang, NAMES)).length === 0);
  chk(lang + ': the banner is not a booking claim', !bookingClaim(disclosureText(CFG, lang, NAMES)));
}

// ---------------------------------------------------------------------------
console.log('\ninvariant 6 in checkDelivery()');
const OK_HEAD = disclosureText(CFG, 'pt', NAMES);
const runWith = (disc, extra) => ({ payload: Object.assign(
  { twilio_sid: 'SM1', outbound_row_status: 201 }, extra || {}, disc ? { disclosure: disc } : {}) });

r = checkDelivery(runWith({ required: true, reason: 'first_contact', lang: 'pt', v: 1, applied: true, sent_head: OK_HEAD }));
chk('a disclosed first contact passes', r.violated.indexOf('6') === -1 && r.detail['6'].reason === 'disclosed');

// THE DELIBERATELY BROKEN CASE (§0.7): the decision said disclose, the wire did not.
r = checkDelivery(runWith({ required: true, reason: 'first_contact', lang: 'pt', v: 1, applied: true,
                            sent_head: 'Olá! Sou a Sofia. Em que posso ajudar?' }));
chk('RED: required but the text sent carries no disclosure',
  r.violated.indexOf('6') !== -1 && r.detail['6'].reason === 'required_but_absent');
{
  // severity read through the event rows, which is where it actually matters
  const rows = invariantEventRows(r, { clientId: 'c1', leadId: 'l1', from: '+351900000000', stage: 'run_end' });
  const row6 = rows.filter(x => x.data.invariant === '6')[0];
  chk('...and it raises a CRITICAL event', !!row6 && row6.severity === 'critical');
  chk('...whose slug names it', !!row6 && row6.data.slug === 'undisclosed_first_contact');
}
chk('...and the alert line names the problem',
  describeViolation('6', r.detail['6']).indexOf('AI disclosure required') === 0, describeViolation('6', r.detail['6']));

r = checkDelivery(runWith({ required: false, ever_before: true, last_origin: 'ai' }));
chk('already disclosed, nothing required -> passes', r.violated.indexOf('6') === -1 && r.detail['6'].reason === 'already_disclosed');

// RED: a lead-facing path that sends without recording a decision at all.
r = checkDelivery(runWith(null));
chk('RED: an unwired path that sends with no disclosure block violates',
  r.violated.indexOf('6') !== -1 && r.detail['6'].reason === 'disclosure_not_recorded');

r = checkDelivery({ payload: { silenced_escalated_lead: true, disclosure: { required: true, sent_head: '' } } });
chk('nothing sent -> 6 does not fire (that is invariant 4\'s job)',
  r.violated.indexOf('6') === -1 && r.detail['6'].reason === 'nothing_sent');

r = checkDelivery(runWith({ required: true, reason: 'handback', lang: 'en', v: 1, applied: true,
                            sent_head: disclosureText(CFG, 'en', NAMES) }));
chk('a handback disclosure passes and records why', r.violated.indexOf('6') === -1 && r.detail['6'].why === 'handback');

chk('6 is always in checked, so a missing check is visible',
  checkDelivery(runWith(null)).checked.indexOf('6') !== -1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
