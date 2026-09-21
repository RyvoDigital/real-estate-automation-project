#!/usr/bin/env node
// Unit tests for src/time_guard.js: the never-invent-a-time guard. Loads the
// SHIPPING source, which ParseClaude and ParseGuardRetry embed verbatim.
//
//   node tests/time_guard.test.js
//   TIME_GUARD_SRC=path node tests/time_guard.test.js
//
// The real replies below are WORD FOR WORD: two from live check 2 (execution
// 4531, 21 Sep 2026), and four from a measurement of 34 real replies to
// unoffered-time requests in en/pt/es, which the pre-21-Sep guard rejected
// while the model was right. And three from the first deploy gate (21 Sep,
// executions 4636 and 4653): "but not 11:00", rejected with its retry.
const fs = require('fs');
const path = require('path');
const SRC = process.env.TIME_GUARD_SRC || path.join(__dirname, '..', 'src', 'time_guard.js');
eval(fs.readFileSync(SRC, 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };
const passes = (label, lead, reply, offered) => { const b = timesNotSupplied(reply, offered, lead); chk(label, b.length === 0, `-> ${JSON.stringify(b)}`); };
const rejects = (label, lead, reply, offered, want) => { const b = timesNotSupplied(reply, offered, lead); chk(label, want ? JSON.stringify(b) === JSON.stringify(want) : b.length > 0, `-> ${JSON.stringify(b)}`); };

const CHECK2 = [{ timeLocal: '09:00' }, { timeLocal: '10:00' }];
const SUITE = [{ timeLocal: '10:00' }, { timeLocal: '15:00' }, { timeLocal: '11:00' }];

console.log('\nthe live false escalation, 21 Sep 2026 (execution 4531), word for word');
passes('check 2, reply 1: declining the lead\'s 11:00', '11:00?',
  "11:00 isn't available, but I do have Thursday 24 September 2026 at 09:00 Lisbon time or 10:00 Lisbon time - would either of those work for you, João?", CHECK2);
passes('check 2, reply 2: the guard retry, same shape', '11:00?',
  "11:00 isn't available, but I can offer Thursday 24 September 2026 at 09:00 Lisbon time or Thursday 24 September 2026 at 10:00 Lisbon time - which one suits you?", CHECK2);

console.log('\nreal replies the OLD guard rejected (measurement, 21 Sep), word for word');
passes('en: "isn\'t available, I\'m afraid"', '17:00?',
  "17:00 isn't available, I'm afraid. I can offer Tuesday 8 September at 10:00, Wednesday 9 September at 15:00, or Thursday 10 September at 11:00 (Lisbon time) - would any of those work for you?", SUITE);
passes('es: "no tenemos disponibilidad"', '¿Y a las 17:00?',
  'A las 17:00 no tenemos disponibilidad por el momento; los horarios que puedo ofrecerle son el martes 8 de septiembre a las 10:00, el miércoles 9 de septiembre a las 15:00 o el jueves 10 de septiembre a las 11:00 (hora de Lisboa). ¿Le viene bien alguno de estos?', SUITE);
passes('es: "no tengo esa franja disponible"', '¿Y a las 17:00?',
  'A las 17:00 no tengo esa franja disponible, pero sí puedo ofrecerle el martes 8 de septiembre a las 10:00, el miércoles 9 de septiembre a las 15:00 o el jueves 10 de septiembre a las 11:00, hora de Lisboa. ¿Le viene bien alguna de estas?', SUITE);
passes('es: "no está entre los horarios disponibles"', '¿El miércoles a las 12:30 es posible?',
  'El miércoles a las 12:30 no está entre los horarios disponibles, pero sí tengo el miércoles 9 de septiembre a las 15:00 (hora de Lisboa). ¿Le viene bien esa hora, o prefiere el martes 8 a las 10:00 o el jueves 10 a las 11:00?', SUITE);

console.log('\nother declines that must pass');
passes('pt plural: "não estão disponíveis"', 'Pode ser às 11:00?', 'As 11:00 não estão disponíveis, mas tenho quinta às 09:00 ou às 10:00.', CHECK2);
passes('es plural: "no están disponibles"', '¿A las 11:00?', 'Las 11:00 no están disponibles; tengo el jueves a las 09:00 o a las 10:00.', CHECK2);
passes('a comma inside ONE clause: "11:00, unfortunately, is taken"', '11:00?', '11:00, unfortunately, is taken. I have 09:00 or 10:00.', CHECK2);
passes('an offered time always passes, with no lead text at all', undefined, 'I have 09:00 or 10:00 on Thursday.', CHECK2);

console.log('\n🔴 what the exemption must NOT open');
rejects('accepting the lead\'s unoffered time: "11:00 it is"', '11:00?', 'Great, 11:00 it is - see you Thursday!', CHECK2, ['11:00']);
rejects('accepting it: "11:00 works for us"', '11:00?', '11:00 works for us.', CHECK2, ['11:00']);
rejects('pt: accepting it', 'Pode ser às 17:00?', 'Perfeito, quinta às 17:00 então.', SUITE, ['17:00']);
rejects('es: accepting it', '¿A las 17:00?', 'Perfecto, el jueves a las 17:00 entonces.', SUITE, ['17:00']);
rejects('"no problem" is not a decline (en)', '17:00?', 'No problem, 17:00 on Thursday it is.', SUITE, ['17:00']);
rejects('"não há problema" is not a decline (pt)', '17:00?', 'Não há problema, 17:00 então!', SUITE, ['17:00']);
rejects('"no hay problema" is not a decline (es)', '¿A las 17:00?', 'No hay problema, a las 17:00 entonces.', SUITE, ['17:00']);
rejects('"booked" alone is an affirmation, not a decline', '17:00?', '17:00 booked!', SUITE, ['17:00']);
// 🔴 The operator's case (21 Sep): declined in one clause, affirmed in the next.
rejects('DECLINED THEN AFFIRMED: "11:00 isn\'t possible on Wednesday, but Thursday at 11:00 works" (11:00 not offered)',
  '11:00?', "11:00 isn't possible on Wednesday, but Thursday at 11:00 works", CHECK2, ['11:00']);
passes('...and the same reply passes when 11:00 IS offered',
  '11:00?', "11:00 isn't possible on Wednesday, but Thursday at 11:00 works", [{ timeLocal: '11:00' }]);
rejects('declining a time the LEAD never named is still inventing one', 'Thursday?', '12:00 is not available, but 09:00 is.', CHECK2, ['12:00']);
rejects('an invented alternative in a declining sentence', '11:00?', "11:00 isn't available, but 14:00 is.", CHECK2, ['14:00']);
rejects('an invented time with nothing declined', 'hi', 'We could do 16:30 on Friday.', CHECK2, ['16:30']);
rejects('no lead text: no exemption (the pre-21-Sep behaviour)', undefined, "11:00 isn't available, but 09:00 is.", CHECK2, ['11:00']);

console.log('\nthe FIRST DEPLOY GATE\'s false escalations, 21 Sep 2026 (executions 4636, 4653), word for word');
// The model declined the lead's "11:00?" with "but not 11:00", and the guard
// rejected the reply AND its retry: runs 2 and 4 of the gate escalated.
passes('gate, first attempt (4636 and 4653, identical)', '11:00?',
  "We actually have Thursday 24 September at 09:00 or 10:00 Lisbon time available, but not 11:00 - would either of those work for you, João?", CHECK2);
passes('gate, guard retry (4636)', '11:00?',
  "We have Thursday 24 September at 09:00 or 10:00 Lisbon time, but not 11:00 - would either of those work for you, João?", CHECK2);
passes('gate, guard retry (4653)', '11:00?',
  "Thursday morning we have 09:00 or 10:00 Lisbon time, but not 11:00 - would either of those work for you, João?", CHECK2);

console.log('\na negation that GOVERNS the lead\'s time declines it, in all three languages');
const GOVERNED = [
['en','11:00?','We have 09:00 or 10:00, but not 11:00.'],['en','11:00?','Not at 11:00, I\'m sorry - 09:00 or 10:00?'],
['en','11:00?','Any time on Thursday except 11:00: 09:00 or 10:00.'],['en','11:00?','I have 09:00 or 10:00, just not Thursday at 11:00.'],
['en','11:00?','I don\'t have an 11:00 slot, but 09:00 or 10:00 work.'],['en','11:00?','I can\'t do 11:00, but 09:00 or 10:00 are free.'],
['en','11:00?','There\'s no 11:00 slot on Thursday; 09:00 or 10:00?'],['en','11:00?','Except for 11:00, Thursday has 09:00 and 10:00.'],
['pt','Pode ser às 11:00?','Tenho às 09:00 ou às 10:00, mas não às 11:00.'],['pt','Pode ser às 11:00?','Menos às 11:00: tenho quinta às 09:00 ou às 10:00.'],
['pt','Pode ser às 11:00?','Não às 11:00, mas posso às 09:00 ou 10:00.'],['pt','Pode ser às 11:00?','Qualquer hora exceto às 11:00 - 09:00 ou 10:00?'],
['pt','Pode ser às 11:00?','Não consigo marcar às 11:00; tenho 09:00 ou 10:00.'],['pt','Pode ser às 11:00?','Não tenho vaga às 11:00, mas tenho às 09:00.'],
['pt','Pode ser às 11:00?','Na quinta tenho 09:00 e 10:00, só não na quinta às 11:00.'],
['es','¿A las 11:00?','Tengo a las 09:00 o a las 10:00, pero no a las 11:00.'],['es','¿A las 11:00?','Excepto a las 11:00, tengo el jueves a las 09:00 o 10:00.'],
['es','¿A las 11:00?','Cualquier hora menos a las 11:00: 09:00 o 10:00.'],['es','¿A las 11:00?','No puedo ofrecer las 11:00; tengo 09:00 o 10:00.'],
['es','¿A las 11:00?','No tengo hueco a las 11:00, pero sí a las 09:00.'],['es','¿A las 11:00?','Salvo a las 11:00, el jueves tengo 09:00 y 10:00.'],
['es','¿A las 11:00?','Pero no el jueves a las 11:00; sí a las 09:00.'],
];
for (const [lang, lead, reply] of GOVERNED) passes(`${lang}: ${reply}`, lead, reply, CHECK2);

console.log('\n🔴 accepting shapes: 11:00 must be REJECTED in every one (21 Sep 2026)');
// Includes the four the clause-level rule accepted before 21 Sep: a decline
// about ANOTHER time, or a bare "unfortunately", let the lead's time through.
const ACCEPTING = [
['en','11:00?','Why not 11:00? See you then.'],['en','11:00?','Great, 11:00 it is.'],['en','11:00?','If not 11:00, then 09:00 works.'],
['en','11:00?','Everything except 11:00 is taken.'],['en','11:00?','Nothing is free except 11:00.'],['en','11:00?','I have nothing except 11:00 left.'],
['en','11:00?','Apart from 11:00, we also have 09:00.'],['en','11:00?','Other than 11:00 there is also 10:00.'],['en','11:00?','Besides 11:00, 09:00 is free too.'],
['en','11:00?','Except 11:00, which is also free, I have 09:00.'],['en','11:00?','Not a problem, 11:00 works.'],['en','11:00?','No problem, 11:00 it is.'],
['en','11:00?','Not only 11:00 but also 09:00 is free.'],['en','11:00?','I have no problem with 11:00.'],['en','11:00?','You are not late, 11:00 is booked.'],
['en','11:00?','Not before 11:00, so 11:00 it is.'],['en','11:00?','I\'ve booked you at 11:00, not 10:00.'],
['en','11:00?','11:00 isn\'t possible on Wednesday, but Thursday at 11:00 works.'],['en','11:00?','Not Wednesday at 11:00 - Thursday at 11:00 is confirmed.'],
['en','11:00?','Unfortunately 10:00 is gone, so 11:00 it is.'],['en','11:00?','Sadly I had to move things, 11:00 is yours.'],
['pt','Pode ser às 11:00?','Porque não às 11:00? Fica marcado.'],['pt','Pode ser às 11:00?','Por que não às 11:00?'],['pt','Pode ser às 11:00?','Pelo menos às 11:00 tenho vaga.'],
['pt','Pode ser às 11:00?','Mais ou menos às 11:00, combinado.'],['pt','Pode ser às 11:00?','Não há problema, às 11:00 então.'],['pt','Pode ser às 11:00?','Não, às 11:00 está ótimo.'],
['pt','Pode ser às 11:00?','Está tudo ocupado exceto às 11:00.'],['pt','Pode ser às 11:00?','Não tenho nada exceto às 11:00.'],['pt','Pode ser às 11:00?','Se não às 11:00, então às 09:00.'],
['pt','Pode ser às 11:00?','Não tenho problema com as 11:00.'],['pt','Pode ser às 11:00?','Infelizmente as 10:00 já foram, fica às 11:00.'],
['es','¿A las 11:00?','¿Por qué no a las 11:00? Queda reservado.'],['es','¿A las 11:00?','Al menos a las 11:00 tengo hueco.'],['es','¿A las 11:00?','Más o menos a las 11:00, perfecto.'],
['es','¿A las 11:00?','Por lo menos a las 11:00 sí.'],['es','¿A las 11:00?','No hay problema, a las 11:00 entonces.'],['es','¿A las 11:00?','No, a las 11:00 está bien.'],
['es','¿A las 11:00?','Todo está ocupado menos a las 11:00.'],['es','¿A las 11:00?','No tengo nada salvo a las 11:00.'],['es','¿A las 11:00?','Si no a las 11:00, a las 09:00.'],
['es','¿A las 11:00?','Solo tengo libre excepto... a las 11:00 sí.'],['es','¿A las 11:00?','Lamentablemente las 10:00 ya no están, quedamos a las 11:00.'],
['en','11:00?','10:00 isn\'t available so 11:00 it is.'],['en','11:00?','Sorry, 10:00 is already taken, I booked you at 11:00.'],['en','11:00?','11:00 isn\'t available on Wednesday, so Thursday at 11:00 then.'],
['pt','Pode ser às 11:00?','As 10:00 não estão disponíveis, então fica às 11:00.'],['pt','Pode ser às 11:00?','As 10:00 já estão ocupadas, marquei às 11:00.'],
['es','¿A las 11:00?','Las 10:00 no están disponibles, así que quedamos a las 11:00.'],['es','¿A las 11:00?','Las 10:00 ya están ocupadas, te reservé a las 11:00.'],
['en','11:00?','I\'m afraid I moved you: 11:00 is confirmed.'],['pt','Pode ser às 11:00?','Infelizmente mudei tudo, fica às 11:00.'],
];
for (const [lang, lead, reply] of ACCEPTING) {
  const b = timesNotSupplied(reply, CHECK2, lead);
  chk(`${lang}: ${reply}`, b.includes('11:00'), `-> ${JSON.stringify(b)}`);
}

console.log('\nEVERY real decline captured on 21 Sep evening passes (tests/fixtures/real_replies_2026-09-21_gate.json)');
// The gate's three, and 90 from tests/time_guard_measure.py (30 per language, the
// gate's shape). The guard before this change rejected 4 of the 30 English ones
// ("I don't have an 11:00 slot"), and the gate's three.
{
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'real_replies_2026-09-21_gate.json'), 'utf8')).replies;
  const bad = fx.filter(r => timesNotSupplied(r.reply, CHECK2, r.lead).length);
  chk(`all ${fx.length} real declines pass (a false escalation is any that does not)`, fx.length === 93 && bad.length === 0,
      bad.length ? bad.map(r => r.reply.slice(0, 60)).join(' | ') : '');
}

console.log('\ntypographic apostrophes read exactly as straight ones (21 Sep 2026, the gate that passed 61f50cc)');
// Execution 4790, word for word: the first attempt used ’ (U+2019) and was
// rejected; the guard retry used ' and passed. Every pattern is written with '.
passes('gate exec 4790, first attempt: "isn’t available" (U+2019)', '11:00?',
  '11:00 isn’t available on Thursday, João - I have 09:00 or 10:00 Lisbon time that morning. Would either of those work for you?', CHECK2);
passes('gate exec 4790, guard retry (straight apostrophe)', '11:00?',
  "11:00 isn't available, João - for Thursday we only have 09:00 or 10:00 Lisbon time. Would either of those work for you?", CHECK2);
// Every case above, re-typed with each typographic mark: same verdict, both ways.
for (const mark of ['’', '‘', 'ʼ', '＇', '′', '`']) {
  const re = s => s.replace(/'/g, mark);
  const fe = GOVERNED.filter(([, l, r]) => r.includes("'") && timesNotSupplied(re(r), CHECK2, l).length);
  const fa = ACCEPTING.filter(([, l, r]) => r.includes("'") && !timesNotSupplied(re(r), CHECK2, l).includes('11:00'));
  chk(`U+${mark.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}: every governed decline still passes, every accepting shape still rejects`,
      fe.length === 0 && fa.length === 0, fe.concat(fa).map(x => x[2]).join(' | '));
}

console.log('\n🔒 KNOWN GAP, recorded rather than hidden: the guard compares TIMES, never DAYS');
// It has never checked days. If 11:00 is offered on Tuesday only, "Thursday at
// 11:00 works" passes. Not introduced by 21 Sep, and not closed by it. See
// remaining-defects-session-2.md. This asserts today's behaviour so a change to
// it is deliberate. Flip it when the day check is built.
passes('KNOWN GAP: 11:00 offered on some day lets "Thursday at 11:00" through',
  'Thursday?', 'Thursday at 11:00 works.', [{ timeLocal: '11:00', dateLocal: '2026-09-22' }]);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
