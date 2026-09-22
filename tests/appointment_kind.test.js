#!/usr/bin/env node
// Unit tests for src/appointment_kind.js. Loads the SHIPPING source rather than
// a copy, so the tests cannot drift from what the workflow embeds.
//
//   node tests/appointment_kind.test.js
//
// No Luxon, so unlike slot_engine.test.js this runs anywhere.
const fs = require('fs');
const path = require('path');
const SRC = process.env.APPOINTMENT_KIND_SRC ||
            path.join(__dirname, '..', 'src', 'appointment_kind.js');
// viewingClaim() reads time_guard.js's negation words and clause boundaries
// (22 Sep 2026): which words negate is that file's rule, not a second list here.
// ONE eval, as one node script: a const in one eval is not visible to another.
eval(fs.readFileSync(process.env.TIME_GUARD_SRC || path.join(__dirname, '..', 'src', 'time_guard.js'), 'utf8') +
     '\n' + fs.readFileSync(SRC, 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };

const IN  = (body) => ({ direction: 'inbound',  body, ai_generated: false });
const AI  = (body) => ({ direction: 'outbound', body, ai_generated: true });
const HUM = (body) => ({ direction: 'outbound', body, ai_generated: false });

// ---- findPropertyRefs: what counts as a property having a name -------------
console.log('\nfindPropertyRefs');
chk('bare reference', findPropertyRefs('Temos o A-1042 em Cascais').join() === 'A-1042');
chk('two-letter prefix', findPropertyRefs('LX-2001 esta disponivel').join() === 'LX-2001');
chk('keyword form', findPropertyRefs('Novo: Ref B-2001, T3 Estoril').join() === 'B-2001');
chk('accented keyword', findPropertyRefs('a referência 10234 do site').join() === '10234');
chk('lowercase after keyword', findPropertyRefs('ref: lx88 no idealista').join() === 'LX88');
chk('several, de-duplicated',
    findPropertyRefs('A-1042 e A-1042 e B-2001').join() === 'A-1042,B-2001');

// The false positives that would flip a meeting into a viewing. Each of these
// appears in ordinary lead traffic, and any one of them matching would put the
// original defect straight back.
console.log('\nfindPropertyRefs — must NOT match');
const NOISE = [
  ['a bedroom count',        'procuro T3 em Cascais'],
  ['a price',                'ate 900.000 EUR, talvez 1.200.000'],
  ['an ISO date',            'na sexta-feira, 2026-09-11'],
  ['a Portuguese postcode',  'moro em 2750-642 Cascais'],
  ['a phone number',         'ligue para +351-933048230'],
  ['a time',                 'as 10:00 ou as 11:00'],
  ['a hyphenated word',      'e uma casa T-3 bem localizada'],
  ['plain prose',            'Ola, gostava de saber o que tem disponivel'],
];
for (const [name, text] of NOISE) {
  const got = findPropertyRefs(text);
  chk(name + ' is not a reference', got.length === 0, got.join());
}
chk('empty / null are safe', findPropertyRefs('').length === 0 && findPropertyRefs(null).length === 0);

// ---- appointmentKindFor: whose words count as evidence ---------------------
console.log('\nappointmentKindFor');
chk('nothing said -> meeting', appointmentKindFor([]).kind === 'meeting');
chk('an ordinary conversation -> meeting',
    appointmentKindFor([IN('Ola, procuro T3 em Cascais ate 900 mil'),
                        AI('Um colega vai confirmar o que temos disponivel.')]).kind === 'meeting');
chk('the lead names a reference -> viewing',
    appointmentKindFor([IN('estou a ver o anuncio B-2001, posso visitar?')]).kind === 'viewing');
chk('a human agent names a reference -> viewing',
    appointmentKindFor([IN('procuro T3'), HUM('Temos o A-1042, quer ver?')]).kind === 'viewing');

// The one that matters most: the model has no inventory, so a reference in its
// own reply is one it invented. Trusting it would re-open this defect a layer
// down -- the model would be allowed to authorise its own claim.
chk('the MODEL naming a reference is NOT evidence',
    appointmentKindFor([IN('procuro T3'), AI('Temos o A-1042 disponivel!')]).kind === 'meeting',
    JSON.stringify(appointmentKindFor([IN('procuro T3'), AI('Temos o A-1042!')])));

// Fail-safe, not fail-open: if the history query ever stops selecting
// ai_generated, every outbound row becomes unattributable and every
// conversation books a meeting. Under-describing, never inventing.
chk('outbound with ai_generated MISSING is ignored',
    appointmentKindFor([{ direction: 'outbound', body: 'Temos o A-1042' }]).kind === 'meeting');
chk('refs are reported alongside the kind',
    appointmentKindFor([IN('quero ver o B-2001')]).refs.join() === 'B-2001');

// ---- viewingClaim: the backstop on the reply itself -----------------------
console.log('\nviewingClaim');
// The message actually sent to a real lead on 2026-09-05.
chk('THE DEFECT is caught',
    viewingClaim('Perfeito! A sua visita esta confirmada para sexta-feira, dia 11 de setembro de 2026, as 10:00, hora de Lisboa. Ate ja!') === 'visita');
const CLAIMS = [
  ['pt verb',      'Podemos visitar na sexta as 10:00'],
  ['pt accented',  'A sua visita está confirmada'],
  ['es',           'Su visita queda confirmada para el viernes'],
  ['en noun',      'Your viewing is confirmed for Friday at 10:00'],
  ['en verb',      'You can visit on Friday at 10:00'],
  ['en gerund',    'We are visiting the property on Friday'],
  ['pt periphrase','Combinado para ver a moradia na sexta'],
  ['en periphrase','Happy to arrange for you to see the property on Friday'],
];
for (const [name, text] of CLAIMS) chk(name + ' is caught', viewingClaim(text) !== null, text);

// Honest meeting wording must survive, in all three languages -- a guard that
// rejects the correct reply just escalates every booking to a human.
console.log('\nviewingClaim — honest wording must pass');
const HONEST = [
  ['pt', 'Perfeito! Fica marcada uma primeira reuniao com o nosso colega para sexta-feira, dia 11 de setembro, as 10:00, hora de Lisboa.'],
  ['es', 'Perfecto, queda agendada una primera reunion con nuestro agente el viernes a las 10:00, hora de Lisboa.'],
  ['en', 'Lovely — I have booked a first meeting with one of our agents for Friday 11 September at 10:00 Lisbon time.'],
  ['offer', 'Para sexta-feira tenho disponibilidade as 10:00 ou as 11:00, hora de Lisboa. Qual prefere?'],
  ['qualify', 'Um colega da nossa equipa vai confirmar o que temos disponivel. Qual e o seu horizonte temporal?'],
];
for (const [name, text] of HONEST) chk(name + ' passes', viewingClaim(text) === null, text);

// ---- the real thread, replayed turn by turn -------------------------------
// The kind is decided from the history that existed WHEN each reply was
// written, not from the finished thread. The B-2001 message arrived AFTER the
// confirmation, so it must not retroactively make that confirmation honest.
console.log('\nthe 2026-09-05 conversation, replayed');
const THREAD = [
  IN('Ola, procuro T3 em Cascais ate 900 mil'),
  AI('Ola! Um colega da nossa equipa vai confirmar o que temos disponivel neste momento.'),
  IN('Queria visitar na sexta-feira'),
  AI('Claro! Para sexta-feira tenho disponibilidade as 10:00 ou as 11:00, hora de Lisboa.'),
  IN('sexta-feira as 10:00 entao'),
  AI('Perfeito! A sua visita esta confirmada para sexta-feira, dia 11 de setembro de 2026, as 10:00, hora de Lisboa.'),
  IN('Novo: Ref B-2001, T3 Estoril, 900.000 EUR'),
];
const atConfirm = appointmentKindFor(THREAD.slice(0, 5));
chk('at the moment of booking, no property had a name', atConfirm.kind === 'meeting',
    JSON.stringify(atConfirm));
chk('so the reply that was sent is rejected',
    viewingClaim(THREAD[5].body) !== null);
chk('a later reference does not backdate it',
    appointmentKindFor(THREAD).kind === 'viewing' && atConfirm.kind === 'meeting');

console.log('\nviewingClaim, 22 Sep 2026: explaining that there is NO viewing is not claiming one (the booking gate, runs 1 and 4)');
// CAPTURED OUTPUT, word for word: all four drafts. Each was rejected; both leads were handed over.
chk("en: run 1, first draft (gate exec 5483) passes", viewingClaim("We'd be looking at a first meeting with our colleague rather than a specific property viewing at this stage, João. I have these times available: Wednesday 23 September at 09:00, Thursday 24 September at 09:00, or Friday 25 September at 09:00, all Lisbon time - which works best for you?") === null, viewingClaim("We'd be looking at a first meeting with our colleague rather than a specific property viewing at this stage, João. I have these times available: Wednesday 23 September at 09:00, Thursday 24 September at 09:00, or Friday 25 September at 09:00, all Lisbon time - which works best for you?"));
chk("en: run 1, guard retry (gate exec 5483) passes", viewingClaim("Just to clarify, no specific property has been named yet, so this would be a first meeting with our colleague to discuss options rather than a viewing. We have Wednesday 23 September at 09:00, Thursday 24 September at 09:00, or Friday 25 September at 09:00, all Lisbon time - which works best for you, João?") === null, viewingClaim("Just to clarify, no specific property has been named yet, so this would be a first meeting with our colleague to discuss options rather than a viewing. We have Wednesday 23 September at 09:00, Thursday 24 September at 09:00, or Friday 25 September at 09:00, all Lisbon time - which works best for you, João?"));
chk("en: run 4, first draft (gate exec 5509) passes", viewingClaim("There's no specific property lined up yet for a viewing, but I'd love to set up a first meeting with our colleague to discuss options with you, João. Would Wednesday 23 September at 11:00, Thursday 24 September at 09:00, or Friday 25 September at 09:00 Lisbon time work for you?") === null, viewingClaim("There's no specific property lined up yet for a viewing, but I'd love to set up a first meeting with our colleague to discuss options with you, João. Would Wednesday 23 September at 11:00, Thursday 24 September at 09:00, or Friday 25 September at 09:00 Lisbon time work for you?"));
chk("en: run 4, guard retry (gate exec 5509) passes", viewingClaim("Since no specific property has come up yet, this would be a first meeting with our colleague rather than a viewing. I can offer Wednesday 23 September at 11:00, Thursday 24 September at 09:00, or Friday 25 September at 09:00, Lisbon time - would any of those work for you, João?") === null, viewingClaim("Since no specific property has come up yet, this would be a first meeting with our colleague rather than a viewing. I can offer Wednesday 23 September at 11:00, Thursday 24 September at 09:00, or Friday 25 September at 09:00, Lisbon time - would any of those work for you, João?"));
for (const [name, text] of [
  ['pt: em vez de uma visita', 'Seria uma primeira reunião com o nosso colega, em vez de uma visita a um imóvel.'],
  ['pt: ainda não é uma visita', 'Isto ainda não é uma visita, é uma primeira conversa com o nosso colega.'],
  ['pt: sem imóvel identificado', 'Como ainda não há nenhum imóvel identificado para visitar, proponho uma primeira reunião.'],
  ['es: en lugar de una visita', 'Sería una primera reunión con nuestro colega en lugar de una visita.'],
  ['es: no es una visita', 'No es una visita todavía, sino una primera reunión con nuestro colega.'],
  ['en: isn\'t a viewing (U+2019)', 'This isn’t a viewing yet, it is a first meeting with our colleague.'],
]) chk(name + ' passes', viewingClaim(text) === null, viewingClaim(text));
// THE DANGEROUS DIRECTION STAYS SHUT (operator, 22 Sep): a viewing promised or
// confirmed with no property identified is rejected, in every language.
for (const [name, text] of [
  ['en: I\'ll book you a viewing of the villa on Thursday', "I'll book you a viewing of the villa on Thursday."],
  ['pt: vou marcar-lhe uma visita à moradia na quinta', 'Vou marcar-lhe uma visita à moradia na quinta-feira.'],
  ['es: le reservo una visita a la villa el jueves', 'Le reservo una visita a la villa el jueves.'],
  ['en: your viewing is confirmed', 'Your viewing is confirmed for Thursday at 09:00.'],
  ['en: a denial in one clause, a viewing in the next', 'There is no property yet, but I will book you a viewing on Thursday.'],
  ['en: the no-property words AFTER the viewing do not excuse it', "I'll book you a viewing, no property details needed."],
  ['pt: não se preocupe, a visita está marcada', 'Não se preocupe, a visita está marcada para quinta-feira.'],
  ['es: no hay problema, le reservo una visita', 'No hay problema, le reservo una visita el jueves.'],
  ['en: not only a meeting, but a viewing too', 'Not only a meeting, but a viewing of the villa too.'],
]) chk(name + ' is still caught', viewingClaim(text) !== null, text);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
