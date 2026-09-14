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

console.log('\nthe 2026-09-14 gap: the model volunteers times, the lead was shown an offer the row never held');
const TUE15 = { startUtc: '2026-09-15T14:00:00.000Z', endUtc: '2026-09-15T15:00:00.000Z', local: '2026-09-15T15:00:00.000+01:00', zone: 'Europe/Lisbon' };
const WED09 = { startUtc: '2026-09-16T08:00:00.000Z', endUtc: '2026-09-16T09:00:00.000Z', local: '2026-09-16T09:00:00.000+01:00', zone: 'Europe/Lisbon' };
const THU09 = { startUtc: '2026-09-17T08:00:00.000Z', endUtc: '2026-09-17T09:00:00.000Z', local: '2026-09-17T09:00:00.000+01:00', zone: 'Europe/Lisbon' };
let named = slotsNamedIn('Wonderful! I would love to set up a first meeting with our colleague. Would any of these work for you: Tuesday, 15 September at 15:00, Wednesday, 16 September at 09:00, or Thursday, 17 September at 09:00 Lisbon time?', [TUE15, WED09, THU09]);
chk('the step 3 reply named all three offered slots', named.length === 3);
named = slotsNamedIn('Great, Cascais or Estoril around 1.5M is very helpful. Are you looking to buy to live in, or as an investment?', [TUE15, WED09, THU09]);
chk('a qualifying reply names none', named.length === 0);
named = slotsNamedIn('Temos terça-feira, dia 15, às 15:00 ou quarta-feira, dia 16, às 09:00 (hora de Lisboa). Qual prefere?', [TUE15, WED09, THU09]);
chk('a Portuguese reply naming two of three', named.length === 2 && named[0] === TUE15 && named[1] === WED09);
chk('no slots, nothing named', slotsNamedIn('Tuesday at 15:00 works', []).length === 0);
const ENGINE_SHAPE = [{ startUtc: '2026-09-15T15:00:00.000Z', endUtc: '2026-09-15T16:00:00.000Z', startLocal: '2026-09-15T16:00:00.000+01:00', dateLocal: '2026-09-15', timeLocal: '16:00', zone: 'Europe/Lisbon' },
                      { startUtc: '2026-09-16T08:00:00.000Z', endUtc: '2026-09-16T09:00:00.000Z', startLocal: '2026-09-16T09:00:00.000+01:00', dateLocal: '2026-09-16', timeLocal: '09:00', zone: 'Europe/Lisbon' }];
named = slotsNamedIn('Would any of these work: Tuesday, 15 September at 16:00, or Wednesday, 16 September at 09:00 Lisbon time?', ENGINE_SHAPE);
chk('slots in the slot engine\'s own shape (startLocal, no local) are recognised -- the 14 Sep miss', named.length === 2);
chk('and a booked slot in the engine shape can be checked as stated', replyStatesSlot('Confirmed for Tuesday 15 September at 16:00 Lisbon time.', ENGINE_SHAPE[0]) === true);

console.log('\nthe retry hint');
chk('names the slot and asks for weekday, date and time', /confirmed for Monday 14 September 2026 at 09:00 Lisbon time/.test(retryBookingHint('Monday 14 September 2026 at 09:00 Lisbon time')) && /weekday, the date and the time/.test(retryBookingHint('x')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
