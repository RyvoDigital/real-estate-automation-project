#!/usr/bin/env node
// Unit tests for src/booking_stated.js. Loads the SHIPPING source rather than a
// copy, so the tests cannot drift from what the workflow embeds.
//
//   node tests/booking_stated.test.js
const fs = require('fs');
const path = require('path');
eval(fs.readFileSync(process.env.BOOKING_STATED_SRC || path.join(__dirname, '..', 'src', 'booking_stated.js'), 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };
const MON = { startUtc: '2026-09-14T08:00:00.000Z', endUtc: '2026-09-14T09:00:00.000Z', local: '2026-09-14T09:00:00.000+01:00', zone: 'Europe/Lisbon' };

console.log('\nthe 2026-09-12 phantom: a booking under a reply about documents');
chk('the step 1 reply does not state the Monday 09:00 meeting', replyStatesSlot('Hi João! Just bring any documents related to your financing pre-approval and a general sense of what you are looking for. Anything specific you would like to prepare?', MON) === false);

console.log('\nreplies that state it');
chk('English, weekday and time', replyStatesSlot('Confirmed! Your first meeting with our colleague is on Monday 14 September 2026 at 09:00 Lisbon time.', MON));
chk('Portuguese, the rehearsal wording', replyStatesSlot('Ficou confirmado! A sua primeira reunião com um dos nossos colegas está marcada para segunda-feira, dia 14 de setembro de 2026, às 09:00 (hora de Lisboa). Até lá!', MON));
chk('Spanish', replyStatesSlot('¡Confirmado! Su primera reunión queda para el lunes 14 de septiembre a las 09:00, hora de Lisboa.', MON));
chk('day of month without the weekday', replyStatesSlot('Confirmed for the 14th at 9:00 Lisbon time.', MON));
chk('"9h" style time', replyStatesSlot('Confirmado para segunda às 9h.', MON));

console.log('\nreplies that do not');
chk('time alone is not enough: every offer list contains it', replyStatesSlot('We have 09:00 available most days.', MON) === false);
chk('weekday alone is not enough', replyStatesSlot('Monday would be lovely.', MON) === false);
chk('the wrong weekday with the right time', replyStatesSlot('Confirmed for Tuesday at 09:00.', MON) === false);
chk('the wrong time with the right weekday', replyStatesSlot('Monday at 10:00 it is.', MON) === false);
chk('empty reply', replyStatesSlot('', MON) === false);
chk('a slot without a local string cannot be checked, so it is not stated', replyStatesSlot('Monday at 09:00', { startUtc: '2026-09-14T08:00:00.000Z' }) === false);

console.log('\nthe retry hint');
chk('names the slot and asks for weekday, date and time', /confirmed for Monday 14 September 2026 at 09:00 Lisbon time/.test(retryBookingHint('Monday 14 September 2026 at 09:00 Lisbon time')) && /weekday, the date and the time/.test(retryBookingHint('x')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
