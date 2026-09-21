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
// while the model was right.
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

console.log('\n🔒 KNOWN GAP, recorded rather than hidden: the guard compares TIMES, never DAYS');
// It has never checked days. If 11:00 is offered on Tuesday only, "Thursday at
// 11:00 works" passes. Not introduced by 21 Sep, and not closed by it. See
// remaining-defects-session-2.md. This asserts today's behaviour so a change to
// it is deliberate. Flip it when the day check is built.
passes('KNOWN GAP: 11:00 offered on some day lets "Thursday at 11:00" through',
  'Thursday?', 'Thursday at 11:00 works.', [{ timeLocal: '11:00', dateLocal: '2026-09-22' }]);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
