#!/usr/bin/env node
// Unit tests for src/operator_card.js: the handoff card sent to the operator
// ("Passagem para uma pessoa"). Loads the SHIPPING sources rather than copies.
//
//   node tests/operator_card.test.js          (luxon from cockpit/node_modules)
//
// Covers the three rendered examples from real stored escalations (24 Sep and
// 14 Sep 2026), every field's "não indicado" path, Portuguese for stored English,
// Lisbon on both sides of the 25 Oct 2026 clock change, the 1600 limit, the
// reason codes the WORKFLOW writes (read from it, never a hand list), and the
// fallback to the old three-line alert, with its sabotage.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.DateTime = require(path.join(ROOT, 'cockpit', 'node_modules', 'luxon')).DateTime;
const S = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const SRC = S('operator_card.js');
// `const` inside a direct eval stays inside it, so the module is loaded through a
// function that hands its names back.
const {
  operatorAlert, buildOperatorCard, validateCard, legacyAlert, alertRecipients, ocSlot,
  OC_FIELDS, OC_REASON_PT, OC_KIND_PT, detectLanguage,
} = new Function('DateTime', S('language.js') + SRC + '\nreturn { operatorAlert, buildOperatorCard, validateCard, '
  + 'legacyAlert, alertRecipients, ocSlot, OC_FIELDS, OC_REASON_PT, OC_KIND_PT, detectLanguage };')(DateTime);

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d && !c ? '  ' + d : ''}`); };
const field = (card, key) => (card.fields.find(x => x.key === key) || {}).value;
const LEGACY = { from: '+351912345230', reason: 'needs_human:I want to talk to a human.', body: 'I want to talk to a human.' };

// The demo lead …230 on 24 Sep 2026, as the rows recorded it (the number is a
// test number with its middle digits replaced).
const DEMO = {
  from: '+351912345230',
  lead: { full_name: 'João', lead_type: 'buyer', budget_min: null, budget_max: '3000000',
          timeline: null, area: 'Cascais or Estoril', qualification: { bedrooms: 3 } },
  lang: 'en', langSource: 'history',
  disclosure: { at: '2026-09-24T14:49:28.000Z' },
  booking: { active: { startUtc: '2026-09-25T16:00:00.000Z' } },
  note: { kind: 'handoff', delivered: true },
  zone: 'Europe/Lisbon', legacy: LEGACY,
};
const JA_DITO_DEMO = 'o cliente foi informado de que fala com um assistente de IA (24 set, 15:49); '
  + 'tem reunião marcada para sexta, 25 set, às 17:00 (Lisboa); '
  + 'o cliente foi informado de que um colega entra em contacto em breve';

// ---------------------------------------------------------------------------
console.log('\nexample 1: high value, …230, 24 Sep 15:03 UTC');
let r = operatorAlert(Object.assign({}, DEMO, { reasons: ['high_value:3000000>=2000000'] }));
chk('sent as a card', r.format === 'card', r.legacyReason);
chk('the exact card', r.text === [
  '*Passagem para uma pessoa*',
  '*Contacto:* João · +351 912 345 230',
  '*Idioma:* inglês',
  '*Procura:* compra · Cascais ou Estoril · T3',
  '*Orçamento:* até 3.000.000 €',
  '*Prazo:* não indicado',
  '*Motivo:* valor acima do limiar (3.000.000 €)',
  '*Já dito:* ' + JA_DITO_DEMO,
].join('\n'), '\n' + r.text);
chk('Motivo carries the budget, not the threshold', r.text.indexOf('2.000.000') === -1);
chk('the full number, never masked', r.text.indexOf('+351 912 345 230') !== -1);

console.log('\nexample 2: "talk to a human" + high value, …230, 24 Sep 15:06 UTC');
r = operatorAlert(Object.assign({}, DEMO, { escalationKind: 'person_request',
  reasons: ['needs_human:I want to talk to a human.', 'high_value:3000000>=2000000'] }));
chk('Motivo: both reasons, in Portuguese, in order',
  field(r.card, 'motivo') === 'pediu para falar com uma pessoa; valor acima do limiar (3.000.000 €)', field(r.card, 'motivo'));
chk('no reason code reaches the card', !/needs_human|high_value|>=/.test(r.text), r.text);
chk('no model text reaches the card', r.text.indexOf('I want to talk') === -1);

console.log('\nexample 3: price question, 14 Sep run (the row since erased by resets)');
r = operatorAlert({ from: '+351912345230', reasons: ["needs_human:Lead asked 'Would they consider 10% under asking?' - a price negotiation question."],
                    note: { kind: 'handoff', delivered: null }, legacy: LEGACY });
chk('still a card', r.format === 'card', r.legacyReason);
for (const k of ['idioma', 'procura', 'orcamento', 'prazo'])
  chk(k + ': não indicado', field(r.card, k) === 'não indicado', field(r.card, k));
chk('Contacto: no name, still the number', field(r.card, 'contacto') === 'não indicado · +351 912 345 230');
chk('Motivo without a kind: not classified, not guessed from the text',
  field(r.card, 'motivo') === 'pedido do cliente (motivo não classificado)', field(r.card, 'motivo'));
r = operatorAlert({ from: '+351912345230', reasons: ['needs_human:x'], escalationKind: 'price_negotiation', legacy: LEGACY });
chk('the same message with the new field: price', field(r.card, 'motivo') === 'pergunta sobre preço e negociação');

// ---------------------------------------------------------------------------
console.log('\nrule 1: nothing known renders "não indicado", never blank, never a default');
r = operatorAlert({ legacy: LEGACY });
chk('a card with no facts at all is still a card', r.format === 'card', r.legacyReason);
chk('every field non-empty', r.card.fields.every(x => x.value.trim().length > 0));
chk('Contacto', field(r.card, 'contacto') === 'não indicado · não indicado');
chk('Motivo', field(r.card, 'motivo') === 'não indicado');
chk('Idioma from the client default is not recorded',
  field(operatorAlert({ lang: 'pt', langSource: null, legacy: LEGACY }).card, 'idioma') === 'não indicado');
chk('Idioma from the message', field(operatorAlert({ lang: 'es', langSource: 'message', legacy: LEGACY }).card, 'idioma') === 'espanhol');
chk('unknown lead_type is omitted, not translated',
  field(operatorAlert({ lead: { lead_type: 'unknown' }, legacy: LEGACY }).card, 'procura') === 'não indicado');
chk('Orçamento, both bounds', field(operatorAlert({ lead: { budget_min: 1500000, budget_max: 2000000 }, legacy: LEGACY }).card, 'orcamento')
  === 'entre 1.500.000 € e 2.000.000 €');
chk('Orçamento, lower bound only', field(operatorAlert({ lead: { budget_min: 800000 }, legacy: LEGACY }).card, 'orcamento')
  === 'a partir de 800.000 €');
chk('a listing reference the lead wrote', field(operatorAlert({ lead: { lead_type: 'buyer' }, propertyRefs: ['B-2001'], legacy: LEGACY }).card, 'procura')
  === 'compra · imóvel referido: B-2001');

console.log('\nrule 2: Já dito is recorded facts only');
const jd = (f) => field(operatorAlert(Object.assign({ legacy: LEGACY, zone: 'Europe/Lisbon' }, f)).card, 'ja_dito');
chk('nothing delivered, no booking: "nada foi prometido"',
  jd({ note: { kind: null } }) === 'o cliente ainda não foi informado de que fala com um assistente de IA; sem reunião marcada; o cliente não recebeu resposta; nada foi prometido',
  jd({ note: { kind: null } }));
chk('a note that failed to deliver is said plainly',
  /a nota de passagem NÃO foi entregue/.test(jd({ note: { kind: 'handoff', delivered: false } })) &&
  /nada foi prometido/.test(jd({ note: { kind: 'handoff', delivered: false } })));
chk('a booking is a commitment: never "nada foi prometido" beside one',
  !/nada foi prometido/.test(jd({ booking: { active: { startUtc: '2026-09-25T16:00:00Z' } }, note: { kind: 'handoff', delivered: false } })));
chk('the retired-booking note', /avisado de que a marcação deixou de constar da agenda/.test(
  jd({ note: { kind: 'booking_retired', delivered: true } })));
chk('a lost race', /o horário escolhido ficou ocupado/.test(jd({ note: { kind: 'slot_taken', delivered: true } })));
chk('media: the conversation passes to a colleague', /a conversa passa para um colega/.test(jd({ note: { kind: 'media_repeat', delivered: true } })));
chk('disclosure state unreadable is not "told" and not "not told"',
  /não foi possível confirmar se o cliente foi informado/.test(jd({ disclosure: { unknown: true } })));
chk('disclosed on THIS message: the card time', /assistente de IA \(24 set, 16:03\)/.test(
  jd({ disclosure: { now: true }, at: '2026-09-24T15:03:45Z' })), jd({ disclosure: { now: true }, at: '2026-09-24T15:03:45Z' }));
chk('offered times: offered, and nothing booked', /foram-lhe propostos horários \(quinta, 1 out, às 10:00 \(Lisboa\); quinta, 1 out, às 15:00 \(Lisboa\)\); nenhum está marcado/
  .test(jd({ booking: { proposed: ['2026-10-01T09:00:00Z', '2026-10-01T14:00:00Z'] } })));
// 24 Sep 2026, the gate's lost races: the lead HAD chosen, and lost the slot. The row
// records the offer, not whether a choice was made, so the card must not say either.
{ const t = jd({ booking: { proposed: ['2026-09-28T08:00:00Z'] }, note: { kind: 'slot_taken', delivered: true } });
  chk('a lost race: never "ainda não escolheu" beside "o horário escolhido ficou ocupado"',
    !/ainda não escolheu/.test(t) && /o horário escolhido ficou ocupado/.test(t), t); }
chk('a retired booking with no new one', /a marcação de sexta, 25 set, às 09:00 \(Lisboa\) deixou de constar da agenda; sem nova reunião marcada/
  .test(jd({ booking: { retired: { startUtc: '2026-09-25T08:00:00Z', reason: 'cancelled' } } })));

// ---------------------------------------------------------------------------
console.log('\nevery time in Europe/Lisbon through the timezone database: 25 Oct 2026 changes the clock');
chk('24 Oct 09:00Z is 10:00 in Lisbon (WEST, UTC+1)', ocSlot('2026-10-24T09:00:00Z', 'Europe/Lisbon') === 'sábado, 24 out, às 10:00 (Lisboa)',
  ocSlot('2026-10-24T09:00:00Z', 'Europe/Lisbon'));
chk('26 Oct 09:00Z is 09:00 in Lisbon (WET, UTC+0)', ocSlot('2026-10-26T09:00:00Z', 'Europe/Lisbon') === 'segunda, 26 out, às 09:00 (Lisboa)',
  ocSlot('2026-10-26T09:00:00Z', 'Europe/Lisbon'));
chk('the booking line on the card, after the change',
  /tem reunião marcada para segunda, 26 out, às 09:00 \(Lisboa\)/.test(jd({ booking: { active: { startUtc: '2026-10-26T09:00:00Z' } } })));
chk('no zone configured: Lisbon, not UTC', ocSlot('2026-10-24T09:00:00Z', undefined) === 'sábado, 24 out, às 10:00 (Lisboa)');
chk('a stored time that is not a time says so', ocSlot('not-a-date', 'Europe/Lisbon') === 'data não indicada');

// ---------------------------------------------------------------------------
console.log('\nstored values render in Portuguese');
const procura = (area) => field(operatorAlert({ lead: { area }, legacy: LEGACY }).card, 'procura');
const prazo = (timeline) => field(operatorAlert({ lead: { timeline }, legacy: LEGACY }).card, 'prazo');
chk('"Cascais or Estoril" -> "Cascais ou Estoril" (stored on 24 Sep)', procura('Cascais or Estoril') === 'Cascais ou Estoril');
chk('"Lisbon" -> "Lisboa"', procura('Lisbon') === 'Lisboa');
chk('"Cascais y Sintra" -> "Cascais e Sintra"', procura('Cascais y Sintra') === 'Cascais e Sintra');
for (const [en, pt] of [['this week', 'esta semana'], ['within 6 months', 'nos próximos 6 meses'],
                        ['6-12 months', '6 a 12 meses'], ['ASAP', 'o mais breve possível'],
                        ['next month', 'no próximo mês'], ['en 3 meses', 'nos próximos 3 meses'],
                        ['by the end of the year', 'até ao fim do ano'], ['esta semana', 'esta semana'],
                        ['nos próximos 6 meses', 'nos próximos 6 meses']])
  chk(`timeline "${en}" -> "${pt}"`, prazo(en) === pt, prazo(en));
r = operatorAlert({ lead: { timeline: 'whenever the kids finish school' }, legacy: LEGACY });
chk('an untranslatable timeline is quoted, not passed off as Portuguese',
  field(r.card, 'prazo') === '"whenever the kids finish school"', field(r.card, 'prazo'));
chk('... and reported, so the node writes the warning event',
  r.untranslated.length === 1 && r.untranslated[0].field === 'timeline');
r = operatorAlert({ lead: { area: 'near the beach in Cascais' }, legacy: LEGACY });
chk('an English area phrase is caught too', r.untranslated.length === 1 && r.untranslated[0].field === 'area', JSON.stringify(r.untranslated));
chk('the demo card has no untranslated value', operatorAlert(Object.assign({}, DEMO, { reasons: ['high_value:3000000>=2000000'] })).untranslated.length === 0);

// ---------------------------------------------------------------------------
console.log('\nWhatsApp: one line per field, no stray formatting, within 1600');
r = operatorAlert({ lead: { full_name: '*João*\nFerreira_' }, legacy: LEGACY });
chk('a name with asterisks, underscores and a newline stays one clean line',
  field(r.card, 'contacto').startsWith('João Ferreira ·'), field(r.card, 'contacto'));
r = operatorAlert({ lead: { area: 'Cascais '.repeat(200) }, reasons: new Array(40).fill('needs_human:x'), legacy: LEGACY });
chk('huge values are capped and the card still fits', r.format === 'card' && r.length <= 1600, r.legacyReason + ' ' + r.length);
chk('a capped value ends in an ellipsis', /…$/.test(field(r.card, 'procura')));
chk('the demo card is well inside the limit', operatorAlert(Object.assign({}, DEMO, { reasons: ['high_value:3000000>=2000000'] })).length < 700);

// ---------------------------------------------------------------------------
console.log('\nrule 3: every reason code the WORKFLOW writes has a Portuguese sentence');
// Read from the workflow, not from a hand list: a code added to the workflow
// and not here fails this test. Only the nodes that write escalation reasons
// are read (AssertInvariants' own `reasons` are invariant reasons, not
// escalations). Neither a literal compared against (`=== 'bad_reply'`) nor a
// fallback operand (`|| 'slot_taken'`, the tail of booking_lost_race) is a head.
const WF = JSON.parse(fs.readFileSync(process.env.WORKFLOW || path.join(ROOT, 'workflows', 'ryvoInboundConc01.json'), 'utf8'));
const wf = Array.isArray(WF) ? WF[0] : WF;
const WRITERS = ['DecideEscalation', 'AfterBooking', 'MarkMediaEscalated', 'MarkLeadEscalated', 'MarkInternalEscalated'];
const heads = new Set();
for (const n of wf.nodes) {
  if (WRITERS.indexOf(n.name) === -1) continue;
  const s = JSON.stringify(n.parameters).replace(/\\"/g, '"').replace(/\\'/g, "'");
  for (const m of s.matchAll(/reasons\.push\(([^;]{0,240})\)/g))
    for (const h of m[1].matchAll(/(?<!(?:[=!]==|\|\|)\s*)'([a-z_]+)(?=[:'])/g)) heads.add(h[1]);
  for (const m of s.matchAll(/reasons:\s*\[\s*'([a-z_]+):/g)) heads.add(m[1]);
}
// CatchInternal's errorType becomes the escalated reason on the internal path.
for (const m of S('catch_internal.js').matchAll(/errorType:\s*'([a-z_]+):/g)) heads.add(m[1]);
const EXPECTED_AT_LEAST = ['needs_human', 'high_value', 'no_availability', 'booking_retired', 'bad_reply_twice',
                           'claude_failed', 'booking_lost_race', 'booking_failed', 'media_unprocessable', 'internal_error'];
chk('the extraction found every head known on 24 Sep (a check that reads nothing proves nothing)',
  EXPECTED_AT_LEAST.every(h => heads.has(h)), 'found: ' + [...heads].join(', '));
for (const h of [...heads].sort()) chk(`"${h}" has a sentence`, typeof OC_REASON_PT[h] === 'function');
const KIND_ENUM = (() => {
  const b = wf.nodes.find(n => n.name === 'BuildClaudeRequest').parameters.jsCode;
  const m = b.match(/const REPLY_SCHEMA = (\{.*?\});\n/);
  const sch = JSON.parse(m[1]);
  const k = sch.properties.escalation_kind;
  return k ? (k.anyOf || []).flatMap(x => x.enum || []) : null;
})();
chk('REPLY_SCHEMA carries escalation_kind', Array.isArray(KIND_ENUM) && KIND_ENUM.length > 0, String(KIND_ENUM));
for (const k of (KIND_ENUM || [])) chk(`escalation_kind "${k}" has a sentence`, typeof OC_KIND_PT[k] === 'string');
chk('every sentence is Portuguese, not a code', Object.values(OC_KIND_PT).every(t => !/_/.test(t)));
r = operatorAlert({ reasons: ['some_new_code:x'], legacy: LEGACY });
chk('at RUNTIME an unmapped code still sends a card, never the code', r.format === 'card' && r.text.indexOf('some_new_code') === -1
  && r.unmapped[0] === 'some_new_code');

// ---------------------------------------------------------------------------
console.log('\nrule 4: building the card never costs the alert');
const LEGACY_TEXT = 'Ryvo escalation\n+351912345230\nReason: needs_human:I want to talk to a human.\nLast msg: "I want to talk to a human."';
chk('legacyAlert is byte for byte the old expression', legacyAlert(LEGACY.from, LEGACY.reason, LEGACY.body) === LEGACY_TEXT);
chk('... and cuts the last message at 140 like it did', legacyAlert('x', 'y', 'z'.repeat(300)).endsWith('z'.repeat(140) + '"'));
r = operatorAlert({ lead: { get full_name() { throw new Error('a getter blew up'); } }, legacy: LEGACY });
chk('a throw inside the builder -> the old alert', r.format === 'legacy' && r.text === LEGACY_TEXT && /^threw: a getter blew up/.test(r.legacyReason),
  r.format + ' ' + r.legacyReason);
r = operatorAlert(null);
chk('no facts object at all -> still something to send', typeof r.text === 'string' && r.text.length > 0 && r.format === 'card');
chk('validateCard: over the limit', validateCard({ text: 'x'.repeat(1601), fields: OC_FIELDS.map(([key]) => ({ key, value: 'v' })) }) === 'over 1600 characters');
chk('validateCard: an empty field', /^empty field/.test(validateCard({ text: 't', fields: OC_FIELDS.map(([key]) => ({ key, value: '' })) })));
chk('validateCard: "undefined" in the text', validateCard({ text: 'a undefined b', fields: OC_FIELDS.map(([key]) => ({ key, value: 'v' })) }) === 'unrendered value');
chk('validateCard: a two-line field', /^multi-line/.test(validateCard({ text: 't', fields: OC_FIELDS.map(([key]) => ({ key, value: 'a\nb' })) })));

// SABOTAGE (§1f). (a) the builder forced to throw, asserting it actually threw;
// (b) the try/catch removed in a copy, asserting the fallback test goes red;
// (c) one reason sentence deleted, asserting the coverage check goes red.
console.log('\nsabotage: each must go red, and each sabotage must be shown to have applied');
{
  const sab = SRC.replace('function buildOperatorCard(facts) {', 'function buildOperatorCard(facts) { throw new Error("SABOTAGE-A");');
  chk('(a) the sabotage applied', sab !== SRC && sab.indexOf('SABOTAGE-A') !== -1);
  const out = new Function('DateTime', 'detectLanguage', sab + '\nreturn operatorAlert(arguments[2]);')(DateTime, detectLanguage, Object.assign({}, DEMO, { reasons: ['high_value:1>=0'] }));
  chk('(a) the builder threw and the old alert went instead', out.format === 'legacy' && out.text === LEGACY_TEXT && /SABOTAGE-A/.test(out.legacyReason), out.legacyReason);
}
{
  const sab = SRC.replace(/  try \{\n    const card = buildOperatorCard\(facts\);([\s\S]*?)\n  \} catch \(e\) \{\n    return plain\([^\n]*\n  \}\n/,
                          '\n    const card = buildOperatorCard(facts);$1\n');
  chk('(b) the sabotage applied (try/catch removed)', sab !== SRC && sab.indexOf("plain('threw: '") === -1);
  let threw = false;
  try { new Function('DateTime', 'detectLanguage', sab + '\nreturn operatorAlert(arguments[2]);')(DateTime, detectLanguage,
          { lead: { get full_name() { throw new Error('x'); } }, legacy: LEGACY }); } catch (e) { threw = true; }
  chk('(b) without the try/catch a bad field THROWS: the fallback test above is what catches it', threw);
}
{
  const sab = SRC.replace(/  booking_lost_race: \(\) => [^\n]*\n/, '');
  chk('(c) the sabotage applied', sab !== SRC && sab.indexOf('booking_lost_race:') === -1);
  const map = new Function('DateTime', 'detectLanguage', sab + '\nreturn OC_REASON_PT;')(DateTime, detectLanguage);
  chk('(c) the coverage check goes red on the deleted sentence', heads.has('booking_lost_race') && typeof map.booking_lost_race !== 'function');
}
{
  // (e) Lisbon replaced by a fixed +01:00: the 26 Oct case must go red.
  const sab = SRC.replace("function ocZone(z) { return (typeof z === 'string' && z.indexOf('/') !== -1) ? z : 'Europe/Lisbon'; }",
                          "function ocZone(z) { return 'UTC+1'; }");
  chk('(e) the sabotage applied', sab !== SRC && sab.indexOf("return 'UTC+1'") !== -1);
  const slot = new Function('DateTime', 'detectLanguage', sab + '\nreturn ocSlot;')(DateTime, detectLanguage);
  chk('(e) a fixed offset gets 24 Oct right', slot('2026-10-24T09:00:00Z', 'Europe/Lisbon').indexOf('10:00') !== -1);
  chk('(e) ... and 26 Oct WRONG, which the real test above would catch',
    slot('2026-10-26T09:00:00Z', 'Europe/Lisbon').indexOf('10:00') !== -1);
}

console.log('\nrule 6: the card never depends on who receives it');
chk('alertRecipients: one number per client today', JSON.stringify(alertRecipients({ escalate_to: '+351900000001' })) === '["+351900000001"]');
chk('alertRecipients: none configured is none, not a default', alertRecipients({}).length === 0);
const CARD_PART = SRC.slice(SRC.indexOf('function ocMotivo('), SRC.indexOf('// Who receives the card.'));
chk('the card-building code never reads a recipient', CARD_PART.length > 1000 && !/escalate_to|recipient/i.test(CARD_PART));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
